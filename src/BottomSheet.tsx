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
} from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedReaction,
  useAnimatedKeyboard,
  interpolate,
  Extrapolation,
  scrollTo,
  withSpring,
  runOnJS,
  measure,
  type SharedValue,
} from 'react-native-reanimated'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import {
  useSafeAreaInsets,
  initialWindowMetrics,
} from 'react-native-safe-area-context'

import type { BottomSheetProps, BottomSheetRef } from './types'
import type { BottomSheetScrollContext } from './context'
import { BottomSheetScrollCtx } from './context'
import { SearchBar } from './SearchBar'
import { SNAP_SPRING, DEFAULT_THEME } from './constants'
import { rubberBand, findTargetSnap, computeSnapPositions } from './worklets'

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
  gesture: any
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
        <Animated.View style={styles.content} collapsable={false}>
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
    const bottomInset =
      hookInsets.bottom || initialWindowMetrics?.insets.bottom || 0

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

    // Dynamic screen height — updates on rotation / layout changes. Worklets
    // read from screenHeightSV so they always see fresh values. Same for insets.
    // Keyboard-induced window shrinks on Android (softInputMode='resize') are
    // filtered out of screenHeight: only height changes while width stays —
    // ignoring these prevents the sheet from resizing every time the keyboard
    // toggles. `realWindowHeightSV` always tracks the actual (possibly shrunk)
    // window, which is what the sheet's absolute parent is laid out against.
    const [screenHeight, setScreenHeight] = useState(
      () => Dimensions.get('window').height
    )
    const screenHeightSV = useSharedValue(Dimensions.get('window').height)
    const realWindowHeightSV = useSharedValue(
      Dimensions.get('window').height
    )
    // Measured height of the sheet's actual parent container. May be smaller
    // than the window (e.g., when the sheet lives inside a screen nested in
    // a bottom-tab navigator — the tab bar consumes space below). Used to
    // stop the sheet from rendering under sibling UI like tab bars.
    const parentHeightSV = useSharedValue(Dimensions.get('window').height)
    const topInsetSV = useSharedValue(topInset)
    const bottomInsetSV = useSharedValue(bottomInset)

    const handleParentLayout = useCallback(
      (e: { nativeEvent: { layout: { height: number } } }) => {
        const h = e.nativeEvent.layout.height
        if (h > 0) parentHeightSV.value = h
      },
      [parentHeightSV]
    )

    useEffect(() => {
      let prev = Dimensions.get('window')
      const sub = Dimensions.addEventListener('change', ({ window }) => {
        realWindowHeightSV.value = window.height
        const keyboardShrink =
          prev.width === window.width && window.height < prev.height
        prev = window
        if (keyboardShrink) return
        setScreenHeight(window.height)
        screenHeightSV.value = window.height
      })
      return () => sub.remove()
    }, [screenHeightSV, realWindowHeightSV])

    useEffect(() => {
      topInsetSV.value = topInset
      bottomInsetSV.value = bottomInset
    }, [topInset, bottomInset, topInsetSV, bottomInsetSV])

    const maxAllowedHeight = screenHeight - topInset

    // Keyboard handling — driven by reanimated's `useAnimatedKeyboard`.
    // Both `*TranslucentAndroid` flags must be true for edge-to-edge apps
    // (Android 15+ default). Without them the hook bakes the nav bar height
    // into the reported keyboard height, leaving a phantom gap below the
    // sheet. The flags are no-ops on iOS and on non-edge-to-edge Android, so
    // they're safe to enable unconditionally.
    const animatedKeyboard = useAnimatedKeyboard({
      isStatusBarTranslucentAndroid: true,
      isNavigationBarTranslucentAndroid: true,
    })
    const keyboardHeight = animatedKeyboard.height

    const [renderSheet, setRenderSheet] = useState(isVisible)
    const [searchResetKey, setSearchResetKey] = useState(0)

    // ── Snap computation (all derived on UI thread) ──

    const snapPoint = snapPointProp ?? 0.6
    const sortedSnaps = useMemo(
      () =>
        snapPointsProp
          ? [...snapPointsProp].sort((a, b) => a - b)
          : [snapPoint],
      [snapPointsProp, snapPoint]
    )

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

    // Sync props → shared values (only when props change)
    useEffect(() => {
      sortedSnapsUI.value = sortedSnaps
      maxSheetHeightSV.value = staticMaxHeight
    }, [sortedSnaps, staticMaxHeight])

    // Derive snap positions on UI thread when maxHeight or screenHeight changes
    useAnimatedReaction(
      () => ({ maxH: maxSheetHeightSV.value, sh: screenHeightSV.value }),
      ({ maxH, sh }) => {
        const snaps = sortedSnapsUI.value
        const result: number[] = []
        for (let i = 0; i < snaps.length; i++) {
          result.push(maxH - sh * snaps[i])
        }
        result.sort((a: number, b: number) => a - b)
        snapsUI.value = result
        dismissAtUI.value = maxH - maxH * 0.4
      }
    )

    // ── Animation shared values ──

    const translateY = useSharedValue(staticMaxHeight)
    const context = useSharedValue(0)
    const scrollOffset = useSharedValue(0)
    const scrollRef = useAnimatedRef<FlatList<any>>()
    const touchStartY = useSharedValue(0)

    // ── Callbacks ──

    const notifyAnimate = useCallback(
      (target: number) => {
        onAnimate?.(target, maxSheetHeightSV.value)
      },
      [onAnimate, maxSheetHeightSV]
    )

    const handleDismissComplete = useCallback(() => {
      setRenderSheet(false)
      onClose?.()
    }, [onClose])

    const open = useCallback(() => {
      setRenderSheet(true)
      const snaps = snapsUI.value
      const target = snaps[Math.min(initialSnapIndex, snaps.length - 1)]
      translateY.value = withSpring(target, SNAP_SPRING, (finished) => {
        if (finished && onAnimate) runOnJS(notifyAnimate)(target)
      })
    }, [initialSnapIndex, translateY, notifyAnimate, onAnimate, snapsUI])

    const close = useCallback(() => {
      const maxH = maxSheetHeightSV.value
      translateY.value = withSpring(maxH, SNAP_SPRING, (finished) => {
        if (finished) {
          if (onAnimate) runOnJS(notifyAnimate)(maxH)
          runOnJS(handleDismissComplete)()
        }
      })
    }, [translateY, maxSheetHeightSV, notifyAnimate, handleDismissComplete, onAnimate])

    useImperativeHandle(ref, () => ({
      expand: (index?: number) => {
        const snaps = snapsUI.value
        const target =
          index !== undefined
            ? snaps[Math.min(index, snaps.length - 1)]
            : snaps[0]
        translateY.value = withSpring(target, SNAP_SPRING, (finished) => {
          if (finished && onAnimate) runOnJS(notifyAnimate)(target)
        })
      },
      collapse: () => {
        const snaps = snapsUI.value
        const target = snaps[snaps.length - 1]
        translateY.value = withSpring(target, SNAP_SPRING, (finished) => {
          if (finished && onAnimate) runOnJS(notifyAnimate)(target)
        })
      },
      close: () => close(),
      snapTo: (index: number) => {
        const snaps = snapsUI.value
        const target = snaps[Math.min(index, snaps.length - 1)]
        translateY.value = withSpring(target, SNAP_SPRING, (finished) => {
          if (finished && onAnimate) runOnJS(notifyAnimate)(target)
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
          translateY.value = withSpring(
            maxSheetHeightSV.value,
            SNAP_SPRING,
            (finished) => {
              if (finished) {
                if (onAnimate)
                  runOnJS(notifyAnimate)(maxSheetHeightSV.value)
                runOnJS(handleDismissComplete)()
              }
            }
          )
        } else {
          translateY.value = withSpring(target, SNAP_SPRING, (finished) => {
            if (finished && onAnimate) runOnJS(notifyAnimate)(target)
          })
          const index = snapsUI.value.indexOf(target)
          if (onSnap) runOnJS(onSnap)(index)
          if (enableHaptics) runOnJS(triggerHaptic)()
        }
      })

    // Content gesture — manualActivation: only activate at scroll top + pull down
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

        if (scrollOffset.value <= 1 && dy > 8) {
          // At scroll top + pulling down → activate sheet drag
          stateManager.activate()
        } else if (dy < -8) {
          // Pulling up → let scroll handle exclusively
          stateManager.fail()
        }
      })
      .onStart(() => {
        context.value = translateY.value
        scrollTo(scrollRef, 0, 0, false)
      })
      .onUpdate((e) => {
        translateY.value = context.value + Math.max(0, e.translationY)
      })
      .onEnd((e) => {
        const target = findTargetSnap(
          translateY.value,
          e.velocityY,
          snapsUI.value,
          dismissAtUI.value
        )

        if (target >= dismissAtUI.value) {
          translateY.value = withSpring(
            maxSheetHeightSV.value,
            SNAP_SPRING,
            (finished) => {
              if (finished) {
                if (onAnimate)
                  runOnJS(notifyAnimate)(maxSheetHeightSV.value)
                runOnJS(handleDismissComplete)()
              }
            }
          )
        } else {
          translateY.value = withSpring(target, SNAP_SPRING, (finished) => {
            if (finished && onAnimate) runOnJS(notifyAnimate)(target)
          })
          const index = snapsUI.value.indexOf(target)
          if (onSnap) runOnJS(onSnap)(index)
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
      const kbH = keyboardHeight.value
      const maxH = maxSheetHeightSV.value
      const sh = screenHeightSV.value
      const shReal = realWindowHeightSV.value
      const parentH = parentHeightSV.value
      const top = topInsetSV.value
      const bot = bottomInsetSV.value

      // Where the sheet's bottom should sit (in parent coords). Two
      // independent constraints — use whichever is tighter:
      //   • Keyboard: sheet bottom must not exceed the keyboard top.
      //     We need a total upward shift of `kbH` from the unshrunk window
      //     bottom. The OS may have already done part of that shift by
      //     shrinking the window itself (Android non-edge-to-edge with
      //     adjustResize); only apply the remainder. `max(0, …)` covers the
      //     rare case where the OS over-shrinks (windowShrink > kbH).
      //   • Parent bottom: sheet bottom must not exceed the parent's own
      //     bottom — this keeps the sheet above sibling UI like bottom
      //     tabs when the keyboard is hidden.
      const windowShrink = Math.max(0, sh - shReal)
      const effectiveShift =
        kbH > 0 && keyboardBehavior === 'padding'
          ? Math.max(0, kbH - windowShrink)
          : 0
      const anchorBottom = Math.min(shReal - effectiveShift, parentH)
      // On rubber-band overdrag up (translateY < 0), keep the bottom anchored
      // to the parent edge so the sheet grows taller instead of sliding up
      // and exposing the backdrop below it. Top still follows translateY.
      const desiredBottom =
        translateY.value < 0 ? anchorBottom : anchorBottom + translateY.value

      // 'height' mode grows the sheet under the keyboard.
      const baseHeight =
        kbH > 0 && keyboardBehavior === 'height' ? maxH + kbH : maxH

      // Clamp top to safe area and shrink height to fit — the ScrollView
      // inside absorbs the reduced space.
      const naturalTop = anchorBottom + translateY.value - baseHeight
      const sheetTop = naturalTop < top ? top : naturalTop
      const height = Math.max(0, desiredBottom - sheetTop)

      const paddingBottom = kbH > 0 && keyboardBehavior !== 'none' ? 0 : bot

      // Directly set `top` and `height` — no `bottom:0 + transform` trick.
      // Keeps layout semantics unambiguous: `top` is literally the sheet's
      // top edge in parent coords. Rendered top === sheetTop ≥ topInset.
      return {
        top: sheetTop,
        height,
        paddingBottom,
      }
    })

    if (!renderSheet && !isVisible) return null

    return (
      <View
        style={StyleSheet.absoluteFill}
        onLayout={handleParentLayout}
      >
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
          accessibilityRole={accessibilityRole as any}
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

          <BottomSheetContent
            searchable={searchable}
            searchPlaceholder={searchPlaceholder}
            onSearch={onSearch}
            searchResetKey={searchResetKey}
            themeProp={themeProp}
            renderSearchIcon={renderSearchIcon}
            renderClearIcon={renderClearIcon}
            ctxValue={ctxRef.current}
            contentRef={contentRef}
            onLayout={isDynamic ? handleContentLayout : undefined}
            isDynamic={isDynamic}
          >
            {children}
          </BottomSheetContent>
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
  // Static mode (consumer passes a `snapPoint` / `snapPoints`): the sheet has
  // a fixed height set via animated style; the inner content fills the
  // remaining space below the chrome so a child ScrollView/FlatList has a
  // bounded viewport to scroll in.
  contentBounded: {
    flex: 1,
  },
  // Dynamic mode (no snap props): no flex constraint, so the children's
  // natural height drives the sheet size. The library measures this view
  // and adds chrome + safe-area-bottom internally.
  contentNatural: {},
  closeIcon: {
    width: 24,
    height: 24,
  },
})
