import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type CartItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
};

type CartState = {
  providerId: string | null;
  providerName: string | null;
  items: CartItem[];
};

const EMPTY: CartState = { providerId: null, providerName: null, items: [] };
const STORAGE_KEY = "yammak.cart.v1";

type CartApi = CartState & {
  total: number;
  count: number;
  add: (provider: { id: string; name: string }, item: Omit<CartItem, "quantity">) => void;
  setQuantity: (productId: string, quantity: number) => void;
  clear: () => void;
};

const CartContext = createContext<CartApi | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CartState>(EMPTY);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setState(JSON.parse(raw) as CartState);
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
    const total = state.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const count = state.items.reduce((sum, i) => sum + i.quantity, 0);
    return {
      ...state,
      total,
      count,
      add: (provider, item) =>
        setState((prev) => {
          const base =
            prev.providerId && prev.providerId !== provider.id
              ? { providerId: provider.id, providerName: provider.name, items: [] }
              : { ...prev, providerId: provider.id, providerName: provider.name };
          const existing = base.items.find((i) => i.productId === item.productId);
          const items = existing
            ? base.items.map((i) =>
                i.productId === item.productId ? { ...i, quantity: i.quantity + 1 } : i,
              )
            : [...base.items, { ...item, quantity: 1 }];
          return { ...base, items };
        }),
      setQuantity: (productId, quantity) =>
        setState((prev) => {
          const items = prev.items
            .map((i) => (i.productId === productId ? { ...i, quantity } : i))
            .filter((i) => i.quantity > 0);
          return items.length ? { ...prev, items } : EMPTY;
        }),
      clear: () => setState(EMPTY),
    };
  }, [state]);

  return <CartContext.Provider value={api}>{children}</CartContext.Provider>;
}

export function useCart(): CartApi {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart يجب أن يُستخدم داخل CartProvider");
  return ctx;
}
