import React, {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import { KeyboardProvider } from './keyboardCompat'

// ─────────────────────────────────────────────────────────────────────────────
// BottomSheetModalProvider — provides a "host" location at the top of the
// React tree where `BottomSheetModal` instances render. Each modal
// registers a node at the provider's position; that node renders as a
// sibling of the provider's children (above all consumer screens), not as
// a child of the screen that owns the modal.
//
// Why: consumer screens often nest a BottomSheet inside another sheet's
// `ScrollView` / `BottomSheetScrollView`. Without the provider, the inner
// sheet's `BottomSheetFlatList` triggers RN's "VirtualizedLists nested
// inside plain ScrollViews" warning. The provider escapes the parent's
// scroll context.
// ─────────────────────────────────────────────────────────────────────────────

type ModalNodes = Record<string, ReactNode>

interface BottomSheetModalContextValue {
  /** Mount a node at the provider's render slot (or update if `id` exists). */
  mount: (id: string, node: ReactNode) => void
  /** Unmount the node with the given id. */
  unmount: (id: string) => void
}

const BottomSheetModalContext =
  createContext<BottomSheetModalContextValue | null>(null)

export function useBottomSheetModalContext(): BottomSheetModalContextValue {
  const ctx = useContext(BottomSheetModalContext)
  if (!ctx) {
    throw new Error(
      'BottomSheetModal requires `<BottomSheetModalProvider>` to be mounted ' +
        'higher in the tree (typically at the app root).'
    )
  }
  return ctx
}

export interface BottomSheetModalProviderProps {
  children?: ReactNode
  /**
   * Whether to wrap the provider's tree in `<KeyboardProvider>` from
   * `react-native-keyboard-controller`. Defaults to `true` so consumers
   * don't have to know about that dependency.
   *
   * Set to `false` if you mount your own `<KeyboardProvider>` higher in
   * the tree (e.g. you need a non-default config such as a different
   * `statusBarTranslucent` flag). Mounting two KeyboardProviders in the
   * same tree double-registers the native keyboard listeners, which
   * works but doubles the work done per keyboard event.
   */
  wrapKeyboardProvider?: boolean
}

export function BottomSheetModalProvider({
  children,
  wrapKeyboardProvider = true,
}: BottomSheetModalProviderProps) {
  // `nodes` is a flat object so React can diff the rendered modals by key
  // when entries are added / updated / removed.
  const [nodes, setNodes] = useState<ModalNodes>({})

  const mount = useCallback((id: string, node: ReactNode) => {
    setNodes((prev) => {
      // Bail out if the node reference is unchanged — avoids needless
      // re-renders when a parent re-renders without changing modal props.
      if (prev[id] === node) return prev
      return { ...prev, [id]: node }
    })
  }, [])

  const unmount = useCallback((id: string) => {
    setNodes((prev) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  const value = useMemo(() => ({ mount, unmount }), [mount, unmount])

  const tree = (
    <BottomSheetModalContext.Provider value={value}>
      {children}
      {Object.entries(nodes).map(([id, node]) => (
        <Fragment key={id}>{node}</Fragment>
      ))}
    </BottomSheetModalContext.Provider>
  )

  if (!wrapKeyboardProvider) return tree
  return <KeyboardProvider>{tree}</KeyboardProvider>
}
