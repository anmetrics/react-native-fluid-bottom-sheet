# react-native-fluid-bottom-sheet

A performant, gesture-driven bottom sheet for React Native. Built on `react-native-reanimated` and `react-native-gesture-handler`. UI-thread animation, snap points, keyboard avoidance, search, FlatList integration, and a portal-style modal API.

## Features

- Spring-driven animation with rubber-band overdrag
- Single or multiple snap points; drag-up-to-expand from the inner list
- **Dynamic sizing** — pass `enableDynamicSizing` and the sheet auto-fits to your content via `<BottomSheetView>` / `<BottomSheetScrollView>`. No hand-rolled measurement hooks; jitter and ratchet are handled internally.
- Frame-perfect keyboard tracking via `useAnimatedKeyboard` (iOS, Android non-edge-to-edge with `adjustResize`, Android edge-to-edge — including correct handling of keyboard-type swaps)
- Sheet bottom respects the bottom safe area when the keyboard is hidden
- Optional search bar and `BottomSheetFlatList` with seamless scroll → drag handoff
- Portal-style `<BottomSheetModal>` for sheets that need to escape a parent's React tree (avoids the "VirtualizedLists nested inside ScrollViews" warning when one sheet's content opens another)
- Theme overrides + render-prop hooks for icons / close button
- No UI library dependencies (no Expo icons, no RNE)

## Installation

```bash
npm install react-native-fluid-bottom-sheet
```

### Peer dependencies

```bash
# Required
npm install react-native-reanimated react-native-gesture-handler react-native-safe-area-context

# Optional — for frame-perfect keyboard tracking on Android (bare RN / EAS builds)
npm install react-native-keyboard-controller
```

| Peer | Required version | Required? |
|------|------------------|-----------|
| `react` | `>=18.0.0` | ✅ |
| `react-native` | `>=0.71.0` | ✅ |
| `react-native-reanimated` | `>=3.4.0` | ✅ |
| `react-native-gesture-handler` | `>=2.0.0` | ✅ |
| `react-native-safe-area-context` | `>=4.0.0` | ✅ |
| `react-native-keyboard-controller` | `>=1.21.7` | Optional |

After installing native peers, rebuild your app once (`pod install` for iOS / Gradle rebuild for Android) so their native modules are linked.

**Expo Go is supported** — no native rebuild needed. The library auto-detects whether `react-native-keyboard-controller` is linked:

| Environment | Keyboard tracking |
|---|---|
| Bare RN / EAS + `keyboard-controller` linked | UI thread, frame-perfect, handles Android keyboard type-swaps |
| Expo Go / `keyboard-controller` not linked | UI thread via Reanimated's `useAnimatedKeyboard` — smooth, minor Android type-swap limitation |

See [`configureKeyboardDriver`](#configurekeyboarddriver) to override the auto-detection.

### Setup

Wrap your app in `GestureHandlerRootView` and `SafeAreaProvider` (with `initialMetrics`):

```tsx
import 'react-native-gesture-handler'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context'

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        {/* ... */}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
```

`initialMetrics` is important — without it, `useSafeAreaInsets()` returns 0 on the first render and the sheet briefly anchors at the wrong position before insets propagate.

`KeyboardProvider` (from `react-native-keyboard-controller` when linked, or a no-op wrapper otherwise) is wired internally by `<BottomSheetModalProvider>`. You don't have to import or wrap with it yourself.

### Android

In `android/app/src/main/AndroidManifest.xml`:

```xml
<activity
  android:name=".MainActivity"
  android:windowSoftInputMode="adjustResize"
  ... />
```

Edge-to-edge (Android 15+ default, or `enableEdgeToEdge=true` on earlier versions) is supported and recommended. The sheet detects edge-to-edge automatically and uses the correct keyboard inset reading.

## Two ways to use it

The library exposes **two top-level components** for two different use cases.

### `<BottomSheet>` — declarative, in-tree

Drive show / hide with a `isVisible` prop. The sheet renders at its position in the React tree.

```tsx
import { BottomSheet, BottomSheetFlatList } from 'react-native-fluid-bottom-sheet'

function ExampleScreen() {
  const [visible, setVisible] = useState(false)

  return (
    <>
      <Button title="Open" onPress={() => setVisible(true)} />

      <BottomSheet
        isVisible={visible}
        onClose={() => setVisible(false)}
        title="My Sheet"
        snapPoint={0.6}
      >
        <BottomSheetFlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ItemRow item={item} />}
        />
      </BottomSheet>
    </>
  )
}
```

### `<BottomSheetModal>` — imperative, portal-rendered

The modal is *defined* in the consumer's tree but *rendered* at the location of `<BottomSheetModalProvider>`, typically the app root. Drive it with `present()` / `dismiss()` on a ref.

Use this when:
- A sheet's content can open another sheet (e.g. a phone-input that opens a country picker). With `<BottomSheet>` the inner sheet's `BottomSheetFlatList` would be nested inside the outer sheet's `ScrollView`, triggering RN's "VirtualizedLists nested inside plain ScrollViews" warning. The portal approach mounts the inner sheet as a sibling of the outer one, escaping that warning.
- You want imperative control (`ref.current?.present()`) instead of state-driven `isVisible`.

```tsx
// 1. Wrap your app in the provider, inside SafeAreaProvider and any
//    other contexts you want the modal to inherit (theme, navigation, …).
import { BottomSheetModalProvider } from 'react-native-fluid-bottom-sheet'

<SafeAreaProvider initialMetrics={initialWindowMetrics}>
  <ThemeProvider>
    <NavigationContainer>
      <BottomSheetModalProvider>
        {/* your app */}
      </BottomSheetModalProvider>
    </NavigationContainer>
  </ThemeProvider>
</SafeAreaProvider>
```

```tsx
// 2. Use BottomSheetModal anywhere; control it with a ref.
import {
  BottomSheetModal,
  BottomSheetModalRef,
} from 'react-native-fluid-bottom-sheet'

function CustomerForm() {
  const modalRef = useRef<BottomSheetModalRef>(null)

  return (
    <>
      <Button title="Edit" onPress={() => modalRef.current?.present()} />

      <BottomSheetModal
        ref={modalRef}
        title="Edit customer"
        snapPoint={0.7}
        onDismiss={() => console.log('closed')}
      >
        <CustomerFormContent />
      </BottomSheetModal>
    </>
  )
}
```

The provider's children render normally; modals appear as siblings *of* those children at the provider's render slot. Place the provider **inside** any context the modal's content should consume (theme, navigation, your own app contexts) and **outside** any view whose layout you don't want the modal to be constrained to.

## Sizing the sheet to its content

Pass `enableDynamicSizing` and use `<BottomSheetView>` (non-scrolling) or `<BottomSheetScrollView>` (scrolling) as the sheet's content. The library measures the natural height of the children and snaps to a fraction that exactly fits content + chrome.

```tsx
import { BottomSheet, BottomSheetView } from 'react-native-fluid-bottom-sheet'

<BottomSheet
  isVisible={visible}
  onClose={onClose}
  title="Edit"
  enableDynamicSizing
>
  <BottomSheetView style={{ paddingHorizontal: 16, paddingTop: 16 }}>
    <Input ... />
    <Input ... />
    <Button ... />
  </BottomSheetView>
</BottomSheet>
```

For scrollable content, use `BottomSheetScrollView`:

```tsx
import { BottomSheet, BottomSheetScrollView } from 'react-native-fluid-bottom-sheet'

<BottomSheet
  isVisible={visible}
  onClose={onClose}
  title="Long form"
  enableDynamicSizing
>
  <BottomSheetScrollView
    contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16 }}
    keyboardShouldPersistTaps="handled"
  >
    {/* ... lots of fields ... */}
  </BottomSheetScrollView>
</BottomSheet>
```

The sheet auto-grows up to `maxDynamicSnapFraction` (default `0.9`); content past that scrolls inside the bounded frame. Before the first measurement arrives the sheet sits at `minDynamicSnapFraction` (default `0.3`).

Why use this over a hand-rolled `useState + onContentSizeChange` recipe:

- The lib applies an asymmetric grow / shrink threshold internally (16dp grow, 4dp shrink) so focus-state jitter on inputs (border 1→2dp, shadow toggles, etc.) doesn't ratchet the snap fraction upward across keyboard show/hide cycles.
- The lib resets its measurement on every `isVisible` boundary so each sheet open starts from a clean baseline.
- `chrome` (drag handle + header + optional search bar) is computed automatically from the props you already passed.

The library lifts the sheet's bottom edge above the system safe area on its own — don't add `paddingBottom: bottomInset` to your scroll content, that would leave a visible empty strip below the last item.

### Manual mode (without dynamic sizing)

If you'd rather drive the snap fraction yourself, omit `enableDynamicSizing` and pass an explicit `snapPoint` (or `snapPoints`). Inside `<BottomSheet>` you can use any `View` / `ScrollView` you want — none of the dynamic-sizing components are required. This is the right choice for sheets whose content is so large it should always scroll regardless of measurement (e.g. a list of orders).

## FlatList content

```tsx
import { BottomSheetFlatList } from 'react-native-fluid-bottom-sheet'

<BottomSheet isVisible={visible} onClose={hide} snapPoint={0.7}>
  <BottomSheetFlatList
    data={items}
    keyExtractor={(item) => item.id}
    renderItem={({ item }) => <Row item={item} />}
  />
</BottomSheet>
```

`BottomSheetFlatList` integrates with the sheet's gesture system: when the list is scrolled to the top, dragging *down* drives the sheet down; dragging *up* expands the sheet to the next snap point. Once the sheet is at the largest snap, dragging *up* scrolls the list normally.

Standalone — outside a `<BottomSheet>` — it falls back to a regular `FlatList` so the same component works in any context.

## Snap points

```tsx
// Single snap point
<BottomSheet snapPoint={0.6} ... />

// Multiple snap points (sorted automatically)
<BottomSheet snapPoints={[0.3, 0.6, 0.9]} initialSnapIndex={1} ... />
```

Each value is a fraction of the screen height. The sheet's effective max height is also clamped to `screenHeight - topInset - bottomInset` so it never sits under the status bar or the nav bar / home indicator.

A swipe gesture animates the sheet to the snap whose position is closest to the gesture's projected end (position + velocity × constant). Swipe past the smallest snap and the sheet dismisses.

## Keyboard handling

The default behavior — `keyboardBehavior="padding"` — keeps the sheet's bottom edge glued to the visible top of the keyboard, frame-by-frame, on the UI thread.

| Mode | Behavior |
|------|----------|
| `'padding'` (default) | Shifts the sheet up so its bottom sits exactly above the keyboard. |
| `'height'` | Grows the sheet taller while keeping its bottom anchored, exposing its content under the keyboard's typical position. |
| `'none'` | Ignores the keyboard. The consumer is responsible for layout. |

When `react-native-keyboard-controller` is linked, the library drives keyboard height via `useKeyboardHandler` worklet callbacks — per-frame on Android (via `WindowInsetsAnimationCompat`, including in-place keyboard type-swaps), `withTiming` matched to the native curve on iOS.

When it is not linked (Expo Go), the library falls back to Reanimated's `useAnimatedKeyboard` — also UI thread and smooth, but does not catch in-place keyboard type-swaps on Android.

`isStatusBarTranslucentAndroid` and `isNavigationBarTranslucentAndroid` are always `true` — required on Android edge-to-edge so the inset isn't double-counted with the nav bar.

## API

### `<BottomSheet>` props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `isVisible` | `boolean` | — | Controls show / hide. |
| `onClose` | `() => void` | — | Fires after the sheet animates out (whether dismissed by gesture, close button, or `isVisible=false`). |
| `title` | `string` | — | Header title. |
| `snapPoint` | `number` | `0.6` | Single snap point as a fraction of screen height. |
| `snapPoints` | `number[]` | — | Multiple snap points (sorted). Overrides `snapPoint`. |
| `initialSnapIndex` | `number` | `0` | Index of the snap point the sheet animates to on present. |
| `searchable` | `boolean` | `false` | Render the built-in search bar. |
| `searchPlaceholder` | `string` | — | Search input placeholder. |
| `onSearch` | `(query: string) => void` | — | Search callback (debounced internally). |
| `showHandle` | `boolean` | `true` | Show the drag handle. |
| `showCloseButton` | `boolean` | `true` | Show the close button in the header. |
| `renderCloseButton` | `(close) => ReactNode` | — | Custom close button. |
| `renderSearchIcon` | `() => ReactNode` | — | Custom search icon (overrides default). |
| `renderClearIcon` | `() => ReactNode` | — | Custom clear icon for the search bar. |
| `theme` | `BottomSheetTheme` | — | Color overrides; see [Theme](#theme). |
| `containerStyle` | `StyleProp<ViewStyle>` | — | Extra styles applied to the sheet container. |
| `keyboardBehavior` | `'padding' \| 'height' \| 'none'` | `'padding'` | See [Keyboard handling](#keyboard-handling). |
| `topInset` | `number` | `max(safeAreaTop, StatusBar.currentHeight)` | Minimum Y the sheet's top can reach. Pass a larger value to keep the sheet under a custom in-screen header. |
| `enableDynamicSizing` | `boolean` | `false` | Auto-size the sheet to content via `<BottomSheetView>` / `<BottomSheetScrollView>`. Overrides `snapPoint` / `snapPoints`. |
| `minDynamicSnapFraction` | `number` | `0.3` | Lower bound on the auto-sized snap fraction; also the snap used before the first content measurement arrives. |
| `maxDynamicSnapFraction` | `number` | `0.9` | Upper bound on the auto-sized snap fraction. Content larger than this scrolls inside the bounded frame (when `BottomSheetScrollView` is used). |
| `enableHaptics` | `boolean` | `false` | Trigger haptic feedback on snap. Requires `react-native-haptic-feedback` or `expo-haptics`; silently no-ops if neither is installed. |
| `onSnap` | `(index: number) => void` | — | Fires after the sheet snaps to a snap point. |
| `onAnimate` | `(toIndex: number) => void` | — | Fires when an animation completes. `toIndex` is the destination snap index, or `-1` when closing. |
| `accessibilityLabel` | `string` | — | A11y label for the sheet. |
| `accessibilityRole` | `string` | `'adjustable'` | A11y role for the sheet. |
| `closeButtonAccessibilityLabel` | `string` | `'Close bottom sheet'` | A11y label for the close button. |

### `BottomSheetRef`

```tsx
const ref = useRef<BottomSheetRef>(null)

ref.current?.expand(index?)   // animate to a snap point (default: largest)
ref.current?.collapse()       // animate to the smallest snap point (does not dismiss)
ref.current?.close()          // animate out and call onClose
ref.current?.snapTo(index)    // alias of expand(index)
```

### `<BottomSheetModal>` props

`BottomSheetModalProps = Omit<BottomSheetProps, 'isVisible' | 'onClose'> & { onDismiss?: () => void }`

The modal manages its own visibility — control it with the ref.

| Prop | Type | Description |
|------|------|-------------|
| `onDismiss` | `() => void` | Fires after the modal animates out (any cause). |

All other props match `<BottomSheet>` (except `isVisible` / `onClose`, which the modal owns).

### `BottomSheetModalRef`

```tsx
const ref = useRef<BottomSheetModalRef>(null)

ref.current?.present()     // mount and animate in
ref.current?.dismiss()     // animate out (then unmount)
ref.current?.snapTo(index) // snap to a specific index (sheet must be presented)
```

### `<BottomSheetModalProvider>`

```tsx
import { BottomSheetModalProvider } from 'react-native-fluid-bottom-sheet'
```

Mount once near the root, inside any context the modal's content should inherit. Required for any `<BottomSheetModal>` consumer; throws if missing.

Internally wraps `<KeyboardProvider>` from `react-native-keyboard-controller` so consumers don't have to. If you already mount your own `KeyboardProvider` higher in the tree (e.g. to pass a non-default config), opt out of the auto-wrap:

```tsx
<BottomSheetModalProvider wrapKeyboardProvider={false}>
  {/* your tree, with your own <KeyboardProvider> elsewhere */}
</BottomSheetModalProvider>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `wrapKeyboardProvider` | `boolean` | `true` | Auto-wraps `<KeyboardProvider>` inside the provider. Set to `false` if you mount your own. |

### `<BottomSheetView>` / `<BottomSheetScrollView>`

Measurement components used in conjunction with `enableDynamicSizing`. When the sheet has dynamic sizing on, these components report their natural height up to the parent sheet via context; the sheet snaps to fit.

```tsx
import {
  BottomSheetView,
  BottomSheetScrollView,
} from 'react-native-fluid-bottom-sheet'
```

| Component | Use for | Measures via | Notes |
|---|---|---|---|
| `BottomSheetView` | Static / non-scrolling content | `onLayout` of a `<View>` | Wraps children in a plain `<View>` — accepts `style`. |
| `BottomSheetScrollView` | Scrollable content | `onContentSizeChange` of a `<ScrollView>` | Forwards every `<ScrollView>` prop. User-supplied `onContentSizeChange` is chained. |

When the sheet's dynamic sizing is off (the default), both components fall back to plain `<View>` / `<ScrollView>` behavior — no measurement reporting happens, so it's safe to leave them in place across both modes.

### Theme

```ts
interface BottomSheetTheme {
  backgroundColor?: string         // sheet background — default '#FFFFFF'
  handleColor?: string             // drag handle bar — default '#CCCCCC'
  textColor?: string               // header title color — default '#000000'
  backdropColor?: string           // backdrop color — default 'rgba(0,0,0,0.5)'
  searchBackgroundColor?: string   // search bar background — default '#F0F0F0'
  searchTextColor?: string         // search bar text — default '#000000'
  searchPlaceholderColor?: string  // search bar placeholder — default '#999999'
}
```

Pass partial overrides via the `theme` prop — unspecified keys fall back to defaults.

### `configureKeyboardDriver`

Override which keyboard tracking implementation the sheet uses. Call once at app startup, before any sheet renders.

```ts
import { configureKeyboardDriver } from 'react-native-fluid-bottom-sheet'

configureKeyboardDriver('reanimated') // always use useAnimatedKeyboard
configureKeyboardDriver('auto')       // default: use keyboard-controller if linked
```

| Value | Behavior |
|-------|----------|
| `'auto'` (default) | Use `react-native-keyboard-controller` if linked, fall back to `useAnimatedKeyboard` otherwise. |
| `'reanimated'` | Always use `useAnimatedKeyboard`, even if `react-native-keyboard-controller` is installed. |

## Caveats

- **Don't enable dynamic sizing for virtualized lists.** A `FlatList` only reports the height of currently-rendered rows, so a measured snap fraction would undercount. Use a fixed snap (e.g. `snapPoint={0.9}`) for `BottomSheetFlatList` content.
- **Inside another sheet, prefer `<BottomSheetModal>` over `<BottomSheet>`.** `<BottomSheet>` renders in-tree, so a `BottomSheetFlatList` inside a `BottomSheetScrollView` triggers React Native's nested-virtualized-lists warning and the inner sheet is clipped by the outer one's bounds.
- **`enableHaptics` requires a haptics library.** The lib lazy-`require`s `react-native-haptic-feedback` then `expo-haptics`. If neither is installed, haptics silently no-op.

## License

MIT
