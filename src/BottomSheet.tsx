import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useImperativeHandle,
  forwardRef,
  memo,
} from 'react'
import {
  StyleSheet,
  View,
  Pressable,
  TouchableOpacity,
  Text,
  Image,
  FlatList,
  Platform,
  Dimensions,
  StatusBar,
  Keyboard,
  type KeyboardEvent,
} from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedReaction,
  interpolate,
  Extrapolation,
  scrollTo,
  withSpring,
  withTiming,
  runOnJS,
  cancelAnimation,
  type SharedValue,
} from 'react-native-reanimated'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import {
  useSafeAreaInsets,
  initialWindowMetrics,
} from 'react-native-safe-area-context'
import {
  useKeyboardHandler,
  KeyboardController,
} from 'react-native-keyboard-controller'

import type { BottomSheetProps, BottomSheetRef } from './types'
import type { BottomSheetScrollContext } from './context'
import { BottomSheetScrollCtx, BottomSheetDynamicSizingCtx } from './context'
import { SearchBar } from './SearchBar'
import { SNAP_SPRING, DEFAULT_THEME } from './constants'
import { rubberBand, findTargetSnap, computeSnapPositions } from './worklets'

// Captured at module scope so worklets receive a primitive constant rather
// than reaching into the `Platform` object on the UI thread.
const IS_IOS = Platform.OS === 'ios'

/** Optional haptic feedback helper */
const triggerHaptic = () => {
  try {
    const Haptic = require('react-native-haptic-feedback').default
    Haptic.trigger('impactLight', {
      enableVibrateFallback: false,
      ignoreAndroidSystemSettings: false,
    })
  } catch {
    try {
      const ExpoHaptics = require('expo-haptics')
      if (ExpoHaptics.impactAsync) {
        ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light)
      }
    } catch {
      // No haptic library found
    }
  }
}


// ─── Sub-components (isolate re-renders) ─────────────────────────

interface BackdropProps {
  translateY: SharedValue<number>
  maxHeight: SharedValue<number>
  color: string
  onPress: () => void
}

const BottomSheetBackdrop = memo(function BottomSheetBackdrop({
  translateY,
  maxHeight,
  color,
  onPress,
}: BackdropProps) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [0, maxHeight.value],
      [1, 0],
      Extrapolation.CLAMP
    ),
  }))

  return (
    <Pressable style={StyleSheet.absoluteFill} onPress={onPress}>
      <Animated.View
        style={[styles.backdrop, { backgroundColor: color }, style]}
      />
    </Pressable>
  )
})

interface HeaderProps {
  gesture: ReturnType<typeof Gesture.Pan>
  showHandle: boolean
  handleColor: string
  title?: string
  textColor: string
  showCloseButton: boolean
  renderCloseButton?: (onClose: () => void) => React.ReactNode
  closeButtonAccessibilityLabel: string
  onClose: () => void
}

const BottomSheetHeader = memo(function BottomSheetHeader({
  gesture,
  showHandle,
  handleColor,
  title,
  textColor,
  showCloseButton,
  renderCloseButton,
  closeButtonAccessibilityLabel,
  onClose,
}: HeaderProps) {
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View>
        {showHandle && (
          <View style={styles.handleContainer}>
            <View
              style={[styles.handle, { backgroundColor: handleColor }]}
            />
          </View>
        )}

        {(title || showCloseButton) && (
          <View style={styles.header}>
            <Text style={[styles.title, { color: textColor }]}>
              {title}
            </Text>

            {showCloseButton &&
              (renderCloseButton ? (
                renderCloseButton(onClose)
              ) : (
                <TouchableOpacity
                  onPress={onClose}
                  accessibilityLabel={closeButtonAccessibilityLabel}
                  accessibilityRole="button"
                >
                  <Image
                    source={require('./assets/icon-close.png')}
                    style={[styles.closeIcon, { tintColor: textColor }]}
                  />
                </TouchableOpacity>
              ))}
          </View>
        )}
      </Animated.View>
    </GestureDetector>
  )
})

interface ContentProps {
  searchable: boolean
  searchPlaceholder?: string
  onSearch?: (query: string) => void
  searchResetKey: number
  themeProp?: BottomSheetProps['theme']
  renderSearchIcon?: () => React.ReactNode
  renderClearIcon?: () => React.ReactNode
  ctxValue: BottomSheetScrollContext
  bottomPadding: number
  children?: React.ReactNode
}

const BottomSheetContent = memo(function BottomSheetContent({
  searchable,
  searchPlaceholder,
  onSearch,
  searchResetKey,
  themeProp,
  renderSearchIcon,
  renderClearIcon,
  ctxValue,
  bottomPadding,
  children,
}: ContentProps) {
  return (
    <>
      {searchable && (
        <SearchBar
          searchPlaceholder={searchPlaceholder}
          onSearch={onSearch}
          onReset={searchResetKey}
          theme={themeProp}
          renderSearchIcon={renderSearchIcon}
          renderClearIcon={renderClearIcon}
        />
      )}

      <BottomSheetScrollCtx.Provider value={ctxValue}>
        <Animated.View
          style={[styles.content, { paddingBottom: bottomPadding }]}
          collapsable={false}
        >
          {children}
        </Animated.View>
      </BottomSheetScrollCtx.Provider>
    </>
  )
})

// ─── Main component ──────────────────────────────────────────────

export const BottomSheet = forwardRef<BottomSheetRef, BottomSheetProps>(
  (
    {
      isVisible,
      onClose,
      title,
      children,
      containerStyle,
      snapPoints: snapPointsProp,
      snapPoint: snapPointProp,
      initialSnapIndex = 0,
      searchable = false,
      searchPlaceholder,
      onSearch,
      showHandle = true,
      showCloseButton = true,
      renderCloseButton,
      renderSearchIcon,
      renderClearIcon,
      theme: themeProp,
      enableHaptics = false,
      accessibilityLabel,
      accessibilityRole = 'adjustable',
      closeButtonAccessibilityLabel = 'Close bottom sheet',
      onSnap,
      onAnimate,
      // Default 'padding': shift the sheet up so its bottom sits on the
      // keyboard. Cross-platform safe — if the host window already shrinks
      // (Android softInputMode='adjustResize'), the shift accounts for that
      // and only fills the remaining gap.
      keyboardBehavior = 'padding',
      topInset: topInsetProp,
      enableDynamicSizing = false,
      minDynamicSnapFraction = 0.3,
      maxDynamicSnapFraction = 0.9,
    },
    ref
  ) => {
    const colors = useMemo(
      () => ({ ...DEFAULT_THEME, ...themeProp }),
      [themeProp]
    )
    const hookInsets = useSafeAreaInsets()
    // The hook returns 0 on the first render when the consumer forgot to
    // pass `initialMetrics` to SafeAreaProvider. `initialWindowMetrics` is
    // populated synchronously at module load via the native bridge, so it
    // works as a fallback regardless of consumer setup.
    const safeAreaTop =
      hookInsets.top || initialWindowMetrics?.insets.top || 0
    // `bottomInset` is read from the *static* `initialWindowMetrics`, NOT
    // the reactive `useSafeAreaInsets()` hook. On some Android edge-to-edge
    // configurations the hook's `bottom` value ticks up while the IME
    // animates open — that would re-render the component, recompute
    // `maxAllowedHeight`/`staticMaxHeight`, and the sheet's max height
    // would jump frame-by-frame to follow it. Static inset = stable
    // calculation = sheet height changes are driven only by the keyboard
    // animation (kbH) and not by `useSafeAreaInsets` jitter.
    const bottomInset = initialWindowMetrics?.insets.bottom ?? 0

    // Effective top inset — the minimum Y the sheet's top can reach.
    // Take the max of every OS-native signal we can read; whichever reports
    // the real protected region wins:
    //   • iOS: hook (covers notch / dynamic island / status bar).
    //   • Android: `StatusBar.currentHeight` reads the `status_bar_height`
    //     resource directly and is always available. On edge-to-edge it
    //     equals the real inset; on non-edge-to-edge the window is already
    //     below the status bar so we overshoot by ~status-bar-height of
    //     padding — benign, and avoids the failure mode where an
    //     edge-to-edge detection heuristic goes wrong and leaves the sheet
    //     exposed under the status bar.
    const topInset =
      topInsetProp ??
      Math.max(
        safeAreaTop,
        Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0
      )

    // Screen height — captured once and updated only on real window-size
    // changes (rotation). Keyboard-induced window shrinks on Android
    // `softInputMode=adjustResize` are filtered out: a height-only
    // decrease while width stays the same is presumed to be the keyboard,
    // and we don't want the sheet to resize every time the keyboard
    // toggles.
    const [screenHeight, setScreenHeight] = useState(
      () => Dimensions.get('window').height
    )
    const screenHeightSV = useSharedValue(Dimensions.get('window').height)
    const topInsetSV = useSharedValue(topInset)
    const bottomInsetSV = useSharedValue(bottomInset)

    useEffect(() => {
      let prev = Dimensions.get('window')
      const sub = Dimensions.addEventListener('change', ({ window }) => {
        const keyboardShrink =
          prev.width === window.width && window.height < prev.height
        prev = window
        if (keyboardShrink) return
        setScreenHeight(window.height)
        screenHeightSV.value = window.height
      })
      return () => sub.remove()
    }, [screenHeightSV])

    useEffect(() => {
      topInsetSV.value = topInset
      bottomInsetSV.value = bottomInset
    }, [topInset, bottomInset, topInsetSV, bottomInsetSV])

    // Cap the sheet's natural height to the area between the top and bottom
    // safe insets — the sheet must never extend behind the system status bar
    // or the bottom navigation / home indicator. Keyboard handling is layered
    // on top of this in `sheetStyle` (kbH expands the sheet upward).
    const maxAllowedHeight = screenHeight - topInset - bottomInset

    // Keyboard handling — driven by `react-native-keyboard-controller`'s
    // `useKeyboardHandler` for native frame-perfect tracking.
    //
    // The library exposes per-frame worklet callbacks that originate from
    // the OS keyboard animation directly:
    //   • Android: `onMove` fires every frame during IME animation
    //     (powered by `WindowInsetsAnimationCompat`). This includes
    //     in-place keyboard type swaps (text ↔ numeric) — the IME inset
    //     animation API dispatches frames for the resize transition.
    //   • iOS: only `onStart` fires with the destination height + native
    //     curve duration (`e.duration`). We match that with `withTiming`
    //     so the sheet animates in lock-step with iOS's keyboard curve.
    //   • `onEnd` and `onInteractive` finalize/track interactive dismiss.
    //
    // Driving `kbDriven` directly from these events means no curve
    // approximation, no JS-thread → UI-thread bridging cost mid-animation,
    // and no race between two animation sources.
    const shouldHandleKeyboard = keyboardBehavior !== 'none'

    // JS-thread mirror of "keyboard is currently shown". Read by
    // `setContentHeight` to filter focus-induced layout grows of the
    // *measured content state* while the keyboard is active.
    const keyboardActiveRef = useRef(false)
    // Initialize from the library's last-known state so the sheet renders
    // correctly when it mounts with the keyboard already visible (e.g.
    // navigating into a screen that auto-focuses an input). Without this
    // seed, `useKeyboardHandler` wouldn't fire any events (the keyboard
    // isn't moving) and `kbDriven` would stay at 0 until the next show /
    // hide event.
    const kbDriven = useSharedValue(
      KeyboardController.isVisible() ? KeyboardController.state().height : 0
    )
    useEffect(() => {
      if (KeyboardController.isVisible()) {
        keyboardActiveRef.current = true
      }
    }, [])

    useKeyboardHandler(
      {
        onStart: (e) => {
          'worklet'
          if (!shouldHandleKeyboard) return
          // iOS: this is the only event that carries the destination
          // height + the OS animation duration. Match the native curve
          // exactly with `withTiming(e.height, { duration: e.duration })`.
          // Android: `onMove` will drive per-frame from here, so we don't
          // need to animate on start.
          if (IS_IOS) {
            // Defensive: some iOS edge cases (interactive dismiss, modal
            // transitions) can deliver duration <= 0; clamp to a sane
            // minimum so `withTiming` doesn't degenerate into a snap.
            const duration = e.duration > 0 ? e.duration : 250
            kbDriven.value = withTiming(e.height, { duration })
          }
        },
        onMove: (e) => {
          'worklet'
          if (!shouldHandleKeyboard) return
          // Android only — per-frame native height. Pixel-perfect
          // tracking, including in-place text↔numeric keyboard swaps.
          if (!IS_IOS) {
            cancelAnimation(kbDriven)
            kbDriven.value = e.height
          }
        },
        onEnd: (e) => {
          'worklet'
          if (!shouldHandleKeyboard) return
          // Final landing — Android's last frame, or iOS's settle event.
          // On iOS we let `withTiming` from `onStart` reach its target;
          // overriding here would cause a final-frame snap.
          if (!IS_IOS) {
            kbDriven.value = e.height
          }
        },
        onInteractive: (e) => {
          'worklet'
          if (!shouldHandleKeyboard) return
          // Interactive (drag-down) keyboard dismiss — both platforms.
          cancelAnimation(kbDriven)
          kbDriven.value = e.height
        },
      },
      [shouldHandleKeyboard]
    )

    // Plain JS keyboard listeners — only used to flip `keyboardActiveRef`
    // (the content-size filter flag). No animation logic here.
    //
    // We listen to `Will`-prefixed events (iOS only — they don't fire on
    // Android) in addition to `Did`-prefixed events so the flag flips
    // BEFORE focus-induced layout grows, not after. On Android, only the
    // `Did` events fire, but that's fine: Android focus changes don't
    // typically race with grow measurements the way iOS does.
    useEffect(() => {
      if (!shouldHandleKeyboard) return

      const g = globalThis as unknown as {
        setTimeout: (fn: () => void, ms: number) => unknown
        clearTimeout: (handle: unknown) => void
      }
      let pendingHide: unknown = null
      const cancelPendingHide = () => {
        if (pendingHide !== null) {
          g.clearTimeout(pendingHide)
          pendingHide = null
        }
      }
      const onShow = () => {
        cancelPendingHide()
        keyboardActiveRef.current = true
      }
      const onHide = () => {
        cancelPendingHide()
        // Defer the flag flip so `setContentHeight` doesn't accept a
        // focus-jitter grow that fires in the same tick as
        // `keyboardDidHide`.
        pendingHide = g.setTimeout(() => {
          keyboardActiveRef.current = false
          pendingHide = null
        }, 80)
      }
      const subs = [
        Keyboard.addListener('keyboardWillShow', onShow),
        Keyboard.addListener('keyboardDidShow', onShow),
        Keyboard.addListener('keyboardDidChangeFrame', onShow),
        Keyboard.addListener('keyboardDidHide', onHide),
      ]
      return () => {
        cancelPendingHide()
        subs.forEach((s) => s.remove())
      }
    }, [shouldHandleKeyboard])

    const [renderSheet, setRenderSheet] = useState(isVisible)
    const [searchResetKey, setSearchResetKey] = useState(0)

    // ── Dynamic sizing ──
    //
    // When `enableDynamicSizing` is set, the sheet's snap point is derived
    // from the natural height of its content as reported by
    // `<BottomSheetView>` / `<BottomSheetScrollView>` / a manual call to
    // `setContentHeight` from the dynamic-sizing context. The sheet sizes
    // itself to fit; if content exceeds `maxDynamicSnapFraction` of the
    // screen, the snap is clamped (and a `BottomSheetScrollView` becomes
    // scrollable inside the bounded frame).
    //
    // Asymmetric thresholds:
    //   • Grow ≥16dp filters focus-state jitter (border 1→2dp, shadow,
    //     subtle padding shifts that can stack to ~14-18dp).
    //   • Shrink ≥4dp lets genuine collapses through immediately.
    // A symmetric threshold causes contentHeight to ratchet upward across
    // keyboard show/hide cycles inside one open session: focus events that
    // bump size past the grow threshold commit, but blur events that only
    // walk back ~8dp are filtered out.
    const [measuredContentHeight, setMeasuredContentHeight] = useState<number>(0)
    // Cache the *smallest* stable measurement seen across the component's
    // lifetime — this represents the content's natural baseline (no focus
    // states, no keyboard-induced reflow). On each `isVisible` open we
    // restore this baseline; if the content has since grown (because, e.g.,
    // an input is focused or text was typed) `onLayout` will fire and the
    // state grows to match. Caching the *latest* value instead of the
    // smallest would let session-time drift (focus jitter, multiline
    // expansion) propagate into the next open's initial size.
    const baselineMeasuredRef = useRef(0)
    const setContentHeight = useCallback((h: number) => {
      if (h <= 0) return
      setMeasuredContentHeight((prev: number) => {
        let next = prev
        // Asymmetric threshold + keyboard-aware grow filter:
        //   • Grow ≥ 24dp filters focus-state jitter on common input
        //     libraries (RNEUI Input shifts ~12-22dp on focus due to
        //     border-thickness + shadow + label-translation animations).
        //   • While the keyboard is active we *don't* grow at all — any
        //     reported size increase during a focus / morph is presumed to
        //     be focus-state reflow rather than legitimate content growth.
        //     Content that genuinely needs more space (e.g. multiline text
        //     a user typed) lives inside `<BottomSheetScrollView>` which
        //     scrolls within the bounded sheet frame.
        //   • Shrink ≥ 4dp always lets genuine collapses through.
        if (h > prev) {
          if (!keyboardActiveRef.current && h - prev >= 24) next = h
        } else if (h < prev) {
          if (prev - h >= 4) next = h
        }
        if (next !== prev) {
          // Baseline tracks the natural "no-keyboard, no-focus" content
          // height — the snap fraction is computed from it (see
          // `sortedSnaps`). Update rules:
          //   • First measurement (baseline === 0): always seed. The
          //     baseline locks here.
          //   • Shrink: always (content actually collapsed).
          //   • Grow: never. Subsequent grows always represent either
          //     focus-state reflow (ignore) or genuinely larger content
          //     (handled by `<BottomSheetScrollView>` scrolling inside
          //     the bounded sheet frame). The baseline is reset on
          //     dismiss + reopen so consumers that need the sheet to
          //     resize with new content (e.g. add-row buttons) get a
          //     fresh measurement on each open.
          if (
            baselineMeasuredRef.current === 0 ||
            next < prev
          ) {
            baselineMeasuredRef.current = next
          }
        }
        return next
      })
    }, [])
    const dynamicCtxValue = useMemo(
      () => (enableDynamicSizing ? { setContentHeight } : null),
      [enableDynamicSizing, setContentHeight]
    )

    // On every `isVisible` boundary, re-seed `measuredContentHeight` with
    // the cached *baseline* (smallest stable measurement seen). First open
    // uses 0 (cache empty) and the sheet starts at `minDynamicSnapFraction`
    // — only visible for one frame, then `BottomSheetView` /
    // `BottomSheetScrollView` reports the actual size and the cache
    // populates. Subsequent opens start at the baseline; if the content
    // has since grown the next layout pass updates the state to match.
    //
    // Resetting to baseline (instead of the latest measurement) prevents
    // session-time drift — focus jitter, multiline expansion, etc. — from
    // making the *next* open render at an inflated size.
    useEffect(() => {
      if (!enableDynamicSizing) return
      setMeasuredContentHeight(baselineMeasuredRef.current)
    }, [enableDynamicSizing, isVisible])

    // Chrome the lib renders on top of the children — must be reserved
    // when computing the dynamic snap fraction.
    const dynamicChromePx = useMemo(() => {
      let c = 0
      if (showHandle) c += 12
      if (title || showCloseButton) c += 48
      if (searchable) c += 56
      return c
    }, [showHandle, title, showCloseButton, searchable])

    // ── Snap computation (all derived on UI thread) ──

    const snapPoint = snapPointProp ?? 0.6
    const explicitSnaps = useMemo(
      () =>
        snapPointsProp
          ? [...snapPointsProp].sort((a, b) => a - b)
          : [snapPoint],
      [snapPointsProp, snapPoint]
    )

    const sortedSnaps = useMemo(() => {
      if (!enableDynamicSizing) return explicitSnaps
      // The snap fraction tracks the *baseline* (smallest stable
      // measurement) — not the latest measurement. Session-time growths
      // (focus state, multiline expansion, etc.) are recorded in
      // `measuredContentHeight` so they trigger this recomputation, but
      // they don't affect the actual snap value. The sheet size stays
      // anchored to the natural-baseline content height; anything bigger
      // scrolls inside `<BottomSheetScrollView>`.
      const effective =
        baselineMeasuredRef.current > 0
          ? baselineMeasuredRef.current
          : measuredContentHeight
      const fraction =
        effective > 0
          ? Math.min(
              Math.max(
                (effective + dynamicChromePx) / screenHeight,
                minDynamicSnapFraction
              ),
              maxDynamicSnapFraction
            )
          : minDynamicSnapFraction
      return [fraction]
    }, [
      enableDynamicSizing,
      explicitSnaps,
      measuredContentHeight,
      dynamicChromePx,
      screenHeight,
      minDynamicSnapFraction,
      maxDynamicSnapFraction,
    ])

    const staticMaxHeight = Math.min(
      screenHeight * sortedSnaps[sortedSnaps.length - 1],
      maxAllowedHeight
    )

    // Shared values — single source of truth for UI thread
    const maxSheetHeightSV = useSharedValue(staticMaxHeight)
    const sortedSnapsUI = useSharedValue<number[]>(sortedSnaps)
    const snapsUI = useSharedValue<number[]>(
      computeSnapPositions(sortedSnaps, staticMaxHeight, screenHeight)
    )
    const dismissAtUI = useSharedValue(staticMaxHeight * 0.6)

    // ── Animation shared values ──

    // Initial off-screen position. Because the sheet's bottom is now lifted
    // above `bottomInset` (see `safeBottom` in `sheetStyle`), translateY needs
    // an extra `bottomInset` of slide-down to fully clear the screen.
    const translateY = useSharedValue(staticMaxHeight + bottomInset)
    const context = useSharedValue(0)
    const scrollOffset = useSharedValue(0)
    const scrollRef = useAnimatedRef<FlatList<any>>()
    const touchStartY = useSharedValue(0)

    // Sync props → shared values when props change. `staticMaxHeight` shifts
    // whenever the consumer's content size changes (multiline grows, error
    // message appears, etc.). Track the last committed target so this
    // effect doesn't re-fire when only `sortedSnaps` changes reference
    // (a fresh array from `useMemo`) without the fitted fraction moving.
    const lastMaxHTargetRef = useRef<number | null>(null)
    useEffect(() => {
      sortedSnapsUI.value = sortedSnaps
      if (lastMaxHTargetRef.current === staticMaxHeight) return
      const isFirst = lastMaxHTargetRef.current === null
      lastMaxHTargetRef.current = staticMaxHeight
      // Always set directly. `kbDriven` already animates the sheet's
      // bottom; layering another `withTiming` on `maxSheetHeightSV` on
      // top of that only creates races, none of which we've found a
      // clean way to suppress. Direct assignment makes content-size
      // changes a single-frame jump (rare and small) instead of a
      // colliding animation.
      void isFirst
      maxSheetHeightSV.value = staticMaxHeight
    }, [sortedSnaps, staticMaxHeight])

    // Derive snap positions on UI thread when maxHeight or screenHeight changes.
    // After recomputing, re-snap `translateY` to the nearest valid position —
    // without this, a `maxH` change (content re-measurement on focus/blur)
    // shifts all snap positions but `translateY` stays stale, causing the
    // sheet to drift from its intended position. Accumulated across multiple
    // focus/blur events this produces visually chaotic positioning.
    useAnimatedReaction(
      () => ({ maxH: maxSheetHeightSV.value, sh: screenHeightSV.value }),
      ({ maxH, sh }) => {
        const snaps = sortedSnapsUI.value
        const result: number[] = []
        for (let i = 0; i < snaps.length; i++) {
          result.push(maxH - sh * snaps[i])
        }
        result.sort((a: number, b: number) => a - b)

        const prevSnaps = snapsUI.value
        snapsUI.value = result
        dismissAtUI.value = maxH - maxH * 0.4

        // Re-snap translateY to nearest valid position. Skip when:
        //   • sheet is off-screen / dismissing (translateY beyond dismiss)
        //   • snap positions haven't actually changed (avoids unnecessary writes)
        const current = translateY.value
        const dismissThreshold = maxH * 0.5
        if (current < dismissThreshold && prevSnaps.length > 0) {
          let nearest = result[0]
          let minDist = Math.abs(current - nearest)
          for (let i = 1; i < result.length; i++) {
            const dist = Math.abs(current - result[i])
            if (dist < minDist) {
              minDist = dist
              nearest = result[i]
            }
          }
          // Only adjust if drifted more than 0.5px (avoid rounding noise)
          if (minDist > 0.5) {
            translateY.value = nearest
          }
        }
      }
    )

    // ── Callbacks ──

    const notifyAnimate = useCallback(
      (toIndex: number) => {
        onAnimate?.(toIndex)
      },
      [onAnimate]
    )

    const handleDismissComplete = useCallback(() => {
      setRenderSheet(false)
      onClose?.()
    }, [onClose])

    const open = useCallback(() => {
      setRenderSheet(true)
      const snaps = snapsUI.value
      const snapIdx = Math.min(initialSnapIndex, snaps.length - 1)
      const target = snaps[snapIdx]
      translateY.value = withSpring(target, SNAP_SPRING, (finished) => {
        if (finished && onAnimate) runOnJS(notifyAnimate)(snapIdx)
      })
    }, [initialSnapIndex, translateY, notifyAnimate, onAnimate, snapsUI])

    const close = useCallback(() => {
      // Dismiss target = sheet height + bottom inset; the latter compensates
      // for the sheet bottom being lifted above the safe area.
      const dismissTarget = maxSheetHeightSV.value + bottomInsetSV.value
      translateY.value = withSpring(dismissTarget, SNAP_SPRING, (finished) => {
        if (finished) {
          if (onAnimate) runOnJS(notifyAnimate)(-1)
          runOnJS(handleDismissComplete)()
        }
      })
    }, [
      translateY,
      maxSheetHeightSV,
      bottomInsetSV,
      notifyAnimate,
      handleDismissComplete,
      onAnimate,
    ])

    useImperativeHandle(ref, () => ({
      expand: (index?: number) => {
        const snaps = snapsUI.value
        const snapIdx = index !== undefined ? Math.min(index, snaps.length - 1) : 0
        const target = snaps[snapIdx]
        translateY.value = withSpring(target, SNAP_SPRING, (finished) => {
          if (finished && onAnimate) runOnJS(notifyAnimate)(snapIdx)
        })
      },
      collapse: () => {
        const snaps = snapsUI.value
        const snapIdx = snaps.length - 1
        const target = snaps[snapIdx]
        translateY.value = withSpring(target, SNAP_SPRING, (finished) => {
          if (finished && onAnimate) runOnJS(notifyAnimate)(snapIdx)
        })
      },
      close: () => close(),
      snapTo: (index: number) => {
        const snaps = snapsUI.value
        const snapIdx = Math.min(index, snaps.length - 1)
        const target = snaps[snapIdx]
        translateY.value = withSpring(target, SNAP_SPRING, (finished) => {
          if (finished && onAnimate) runOnJS(notifyAnimate)(snapIdx)
        })
      },
    }))

    useEffect(() => {
      if (isVisible) {
        setSearchResetKey((k) => k + 1)
        onSearch?.('')
        open()
      } else if (renderSheet) {
        close()
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isVisible, open, close, onSearch])

    // ── Gestures ──

    const scrollHandler = useAnimatedScrollHandler({
      onScroll: (event) => {
        scrollOffset.value = event.contentOffset.y
      },
    })

    // Header gesture — always draggable
    const headerGesture = Gesture.Pan()
      .activeOffsetY([-4, 4])
      .onStart(() => {
        context.value = translateY.value
      })
      .onUpdate((e) => {
        let newY = context.value + e.translationY

        if (newY < 0) {
          newY = -rubberBand(-newY, maxSheetHeightSV.value * 0.25)
        }

        translateY.value = newY
      })
      .onEnd((e) => {
        if (translateY.value < 0) {
          translateY.value = withSpring(0, SNAP_SPRING, (finished) => {
            if (finished && onAnimate) runOnJS(notifyAnimate)(0)
          })
          return
        }

        const target = findTargetSnap(
          translateY.value,
          e.velocityY,
          snapsUI.value,
          dismissAtUI.value
        )

        if (target >= dismissAtUI.value) {
          const dismissTarget = maxSheetHeightSV.value + bottomInsetSV.value
          translateY.value = withSpring(
            dismissTarget,
            SNAP_SPRING,
            (finished) => {
              if (finished) {
                if (onAnimate) runOnJS(notifyAnimate)(-1)
                runOnJS(handleDismissComplete)()
              }
            }
          )
        } else {
          const snapIndex = snapsUI.value.indexOf(target)
          translateY.value = withSpring(target, SNAP_SPRING, (finished) => {
            if (finished && onAnimate) runOnJS(notifyAnimate)(snapIndex)
          })
          if (onSnap) runOnJS(onSnap)(snapIndex)
          if (enableHaptics) runOnJS(triggerHaptic)()
        }
      })

    // Content gesture — manualActivation: drives the sheet when either
    //   • at scroll top + pulling down (collapse / dismiss), or
    //   • at scroll top + pulling up while a higher snap is available (expand).
    // Otherwise yields to the list's native scroll.
    const contentPanGesture = Gesture.Pan()
      .manualActivation(true)
      .onTouchesDown((e, _stateManager) => {
        if (e.numberOfTouches === 1) {
          touchStartY.value = e.allTouches[0].y
        }
      })
      .onTouchesMove((e, stateManager) => {
        if (e.numberOfTouches !== 1) {
          stateManager.fail()
          return
        }

        const dy = e.allTouches[0].y - touchStartY.value
        const atScrollTop = scrollOffset.value <= 1
        const highestSnap = snapsUI.value[0] ?? 0
        const canExpand = translateY.value > highestSnap + 0.5

        if (dy > 8 && atScrollTop) {
          // At scroll top + pulling down → drag sheet (collapse / dismiss)
          stateManager.activate()
        } else if (dy < -8) {
          if (atScrollTop && canExpand) {
            // At scroll top + pulling up with room to expand → drag sheet up
            stateManager.activate()
          } else {
            // Already at highest snap, or list is mid-scroll → let scroll handle
            stateManager.fail()
          }
        }
      })
      .onStart(() => {
        context.value = translateY.value
        scrollTo(scrollRef, 0, 0, false)
      })
      .onUpdate((e) => {
        let newY = context.value + e.translationY
        if (newY < 0) {
          newY = -rubberBand(-newY, maxSheetHeightSV.value * 0.25)
        }
        translateY.value = newY
      })
      .onEnd((e) => {
        const target = findTargetSnap(
          translateY.value,
          e.velocityY,
          snapsUI.value,
          dismissAtUI.value
        )

        if (target >= dismissAtUI.value) {
          const dismissTarget = maxSheetHeightSV.value + bottomInsetSV.value
          translateY.value = withSpring(
            dismissTarget,
            SNAP_SPRING,
            (finished) => {
              if (finished) {
                if (onAnimate) runOnJS(notifyAnimate)(-1)
                runOnJS(handleDismissComplete)()
              }
            }
          )
        } else {
          const snapIndex = snapsUI.value.indexOf(target)
          translateY.value = withSpring(target, SNAP_SPRING, (finished) => {
            if (finished && onAnimate) runOnJS(notifyAnimate)(snapIndex)
          })
          if (onSnap) runOnJS(onSnap)(snapIndex)
          if (enableHaptics) runOnJS(triggerHaptic)()
        }
      })

    const nativeScrollGesture = Gesture.Native()
    const contentGesture = Gesture.Simultaneous(
      contentPanGesture,
      nativeScrollGesture
    )

    // ── Scroll context ──

    const ctxRef = useRef<BottomSheetScrollContext | null>(null)

    if (!ctxRef.current) {
      ctxRef.current = {
        scrollHandler,
        contentGesture,
        scrollRef,
      }
    }

    ctxRef.current.scrollHandler = scrollHandler
    ctxRef.current.contentGesture = contentGesture

    // ── Animated styles ──

    const sheetStyle = useAnimatedStyle(() => {
      // `kbDriven` is driven by `useKeyboardHandler`'s native worklet
      // events: per-frame on Android, `withTiming(target, native-duration)`
      // on iOS. Tracks the OS keyboard frame-by-frame including in-place
      // text↔numeric type swaps.
      const kbH = kbDriven.value
      const maxH = maxSheetHeightSV.value
      const sh = screenHeightSV.value
      const top = topInsetSV.value
      const bot = bottomInsetSV.value

      // Sheet's bottom edge sits above the keyboard top when the keyboard
      // is up, otherwise above the bottom safe area. `Math.max(bot, kbH)`
      // collapses both cases into one shift from the screen bottom.
      const handlesKeyboard = kbH > 0 && keyboardBehavior === 'padding'
      const effectiveKb = handlesKeyboard ? kbH : 0
      const bottomShift = Math.max(bot, effectiveKb)
      const anchorBottom = sh - bottomShift
      // On rubber-band overdrag up (translateY < 0), keep the bottom
      // anchored so the sheet grows taller instead of sliding up and
      // exposing the backdrop below it. Top still follows translateY.
      const desiredBottom =
        translateY.value < 0 ? anchorBottom : anchorBottom + translateY.value

      // `'height'` keyboard mode grows the sheet under the keyboard
      // (consumer is expected to handle their own scroll inside).
      const baseHeight =
        kbH > 0 && keyboardBehavior === 'height' ? maxH + kbH : maxH

      // Clamp top to the safe area and shrink height to fit when the
      // sheet's natural top would otherwise land above it.
      const naturalTop = anchorBottom + translateY.value - baseHeight
      const sheetTop = naturalTop < top ? top : naturalTop
      const height = Math.max(0, desiredBottom - sheetTop)

      // Directly set `top` and `height` — no `bottom:0 + transform` trick.
      // Keeps layout semantics unambiguous: `top` is literally the sheet's
      // top edge in parent coords. Rendered top === sheetTop ≥ topInset.
      // The sheet's bottom is already lifted above the bottom safe area via
      // `safeBottom`, so no `paddingBottom` is needed here.
      return {
        top: sheetTop,
        height,
      }
    })

    if (!renderSheet && !isVisible) return null

    return (
      <View style={StyleSheet.absoluteFill}>
        <BottomSheetBackdrop
          translateY={translateY}
          maxHeight={maxSheetHeightSV}
          color={colors.backdropColor}
          onPress={close}
        />

        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.backgroundColor,
            },
            containerStyle,
            sheetStyle,
          ]}
          accessibilityLabel={accessibilityLabel}
          accessibilityRole={accessibilityRole}
        >
          <BottomSheetHeader
            gesture={headerGesture}
            showHandle={showHandle}
            handleColor={colors.handleColor}
            title={title}
            textColor={colors.textColor}
            showCloseButton={showCloseButton}
            renderCloseButton={renderCloseButton}
            closeButtonAccessibilityLabel={closeButtonAccessibilityLabel}
            onClose={close}
          />

          <BottomSheetDynamicSizingCtx.Provider value={dynamicCtxValue}>
            <BottomSheetContent
              searchable={searchable}
              searchPlaceholder={searchPlaceholder}
              onSearch={onSearch}
              searchResetKey={searchResetKey}
              themeProp={themeProp}
              renderSearchIcon={renderSearchIcon}
              renderClearIcon={renderClearIcon}
              ctxValue={ctxRef.current}
              bottomPadding={bottomInset}
            >
              {children}
            </BottomSheetContent>
          </BottomSheetDynamicSizingCtx.Provider>
        </Animated.View>
      </View>
    )
  }
)

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  closeIcon: {
    width: 24,
    height: 24,
  },
})
