import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type CartItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
};

/** سلة واحدة تخص متجراً أو مطعماً محدداً. */
export type Basket = {
  providerId: string;
  providerName: string;
  items: CartItem[];
  total: number;
  count: number;
};

type StoredBasket = { providerId: string; providerName: string; items: CartItem[] };
type CartState = { activeId: string | null; baskets: StoredBasket[] };

const EMPTY: CartState = { activeId: null, baskets: [] };
export const CART_STORAGE_KEY = "yammak.cart.v1";
const STORAGE_KEY = CART_STORAGE_KEY;

type LegacyState = { providerId: string | null; providerName: string | null; items: CartItem[] };

/** قراءة التخزين مع دعم صيغة السلة القديمة (متجر واحد) بدون فقدان بيانات المستخدم. */
function parseStored(raw: string): CartState {
  const parsed = JSON.parse(raw) as Partial<CartState> & Partial<LegacyState>;
  if (Array.isArray(parsed.baskets)) {
    return {
      activeId: parsed.activeId ?? parsed.baskets[0]?.providerId ?? null,
      baskets: parsed.baskets,
    };
  }
  if (parsed.providerId && Array.isArray(parsed.items) && parsed.items.length) {
    return {
      activeId: parsed.providerId,
      baskets: [
        {
          providerId: parsed.providerId,
          providerName: parsed.providerName ?? "",
          items: parsed.items,
        },
      ],
    };
  }
  return EMPTY;
}

type CartApi = {
  /** السلة النشطة (المتجر المفتوح حالياً). */
  providerId: string | null;
  providerName: string | null;
  items: CartItem[];
  total: number;
  count: number;
  /** كل السلال المفتوحة من عدة متاجر. */
  baskets: Basket[];
  /** مجموع القطع في كل السلال. */
  totalCount: number;
  add: (provider: { id: string; name: string }, item: Omit<CartItem, "quantity">) => void;
  setQuantity: (productId: string, quantity: number) => void;
  /** تعديل كمية داخل سلة محددة. */
  setQuantityIn: (providerId: string, productId: string, quantity: number) => void;
  /** تبديل السلة النشطة. */
  setActive: (providerId: string) => void;
  /** حذف سلة متجر كاملة. */
  removeBasket: (providerId: string) => void;
  /** إفراغ السلة النشطة فقط (بعد إتمام طلبها). */
  clear: () => void;
  /** إفراغ كل السلال. */
  clearAll: () => void;
};

const CartContext = createContext<CartApi | null>(null);

function withTotals(b: StoredBasket): Basket {
  return {
    ...b,
    total: b.items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    count: b.items.reduce((sum, i) => sum + i.quantity, 0),
  };
}

function prune(state: CartState): CartState {
  const baskets = state.baskets.filter((b) => b.items.length > 0);
  const activeId = baskets.some((b) => b.providerId === state.activeId)
    ? state.activeId
    : (baskets[0]?.providerId ?? null);
  return { activeId, baskets };
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CartState>(EMPTY);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setState(parseStored(raw));
    } catch {
      /* تجاهل بيانات تالفة */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* التخزين غير متاح */
    }
  }, [state]);

  const api = useMemo<CartApi>(() => {
    const baskets = state.baskets.map(withTotals);
    const active = baskets.find((b) => b.providerId === state.activeId) ?? null;

    const updateItems = (providerId: string, productId: string, quantity: number): void =>
      setState((prev) =>
        prune({
          ...prev,
          baskets: prev.baskets.map((b) =>
            b.providerId === providerId
              ? {
                  ...b,
                  items: b.items
                    .map((i) => (i.productId === productId ? { ...i, quantity } : i))
                    .filter((i) => i.quantity > 0),
                }
              : b,
          ),
        }),
      );

    return {
      providerId: active?.providerId ?? null,
      providerName: active?.providerName ?? null,
      items: active?.items ?? [],
      total: active?.total ?? 0,
      count: active?.count ?? 0,
      baskets,
      totalCount: baskets.reduce((sum, b) => sum + b.count, 0),
      add: (provider, item) =>
        setState((prev) => {
          const existingBasket = prev.baskets.find((b) => b.providerId === provider.id);
          const nextBaskets = existingBasket
            ? prev.baskets.map((b) =>
                b.providerId === provider.id
                  ? {
                      ...b,
                      providerName: provider.name,
                      items: b.items.some((i) => i.productId === item.productId)
                        ? b.items.map((i) =>
                            i.productId === item.productId ? { ...i, quantity: i.quantity + 1 } : i,
                          )
                        : [...b.items, { ...item, quantity: 1 }],
                    }
                  : b,
              )
            : [
                ...prev.baskets,
                {
                  providerId: provider.id,
                  providerName: provider.name,
                  items: [{ ...item, quantity: 1 }],
                },
              ];
          return { activeId: provider.id, baskets: nextBaskets };
        }),
      setQuantity: (productId, quantity) => {
        if (!state.activeId) return;
        updateItems(state.activeId, productId, quantity);
      },
      setQuantityIn: (providerId, productId, quantity) =>
        updateItems(providerId, productId, quantity),
      setActive: (providerId) => setState((prev) => ({ ...prev, activeId: providerId })),
      removeBasket: (providerId) =>
        setState((prev) =>
          prune({ ...prev, baskets: prev.baskets.filter((b) => b.providerId !== providerId) }),
        ),
      clear: () =>
        setState((prev) =>
          prune({ ...prev, baskets: prev.baskets.filter((b) => b.providerId !== prev.activeId) }),
        ),
      clearAll: () => setState(EMPTY),
    };
  }, [state]);

  return <CartContext.Provider value={api}>{children}</CartContext.Provider>;
}

export function useCart(): CartApi {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart يجب أن يُستخدم داخل CartProvider");
  return ctx;
}
