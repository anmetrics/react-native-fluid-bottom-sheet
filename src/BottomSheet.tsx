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
  Keyboard,
  Platform,
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
  measure,
  Easing,
  type SharedValue,
} from 'react-native-reanimated'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'

import type { BottomSheetProps, BottomSheetRef } from './types'
import type { BottomSheetScrollContext } from './context'
import { BottomSheetScrollCtx } from './context'
import { SearchBar } from './SearchBar'
import { SCREEN_HEIGHT, SNAP_SPRING, DEFAULT_THEME } from './constants'
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

function useSafeInsets(): { top: number; bottom: number } {
  try {
    const { useSafeAreaInsets } = require('react-native-safe-area-context')
    const insets = useSafeAreaInsets()
    return { top: insets.top, bottom: insets.bottom }
  } catch {
    return { top: 0, bottom: 0 }
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
  contentRef: React.Ref<Animated.View>
  onLayout?: (e: { nativeEvent: { layout: { height: number } } }) => void
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
  contentRef,
  onLayout,
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
          ref={contentRef}
          style={styles.content}
          onLayout={onLayout}
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
      keyboardBehavior = 'padding',
    },
    ref
  ) => {
    const colors = useMemo(
      () => ({ ...DEFAULT_THEME, ...themeProp }),
      [themeProp]
    )
    const { top: topInset, bottom: bottomInset } = useSafeInsets()
    const maxAllowedHeight = SCREEN_HEIGHT - topInset

    // Keyboard handling — iOS only by default.
    // Android adjustResize (default) already shrinks the window, so the sheet
    // at bottom:0 moves up automatically. Applying an extra offset would
    // double-shift the sheet and leave a gap above the keyboard.
    // On Android, only apply if keyboardBehavior is explicitly set AND the app
    // uses adjustNothing (user's responsibility to match).
    const keyboardHeight = useSharedValue(0)
    const shouldHandleKeyboard =
      keyboardBehavior !== 'none' && Platform.OS === 'ios'

    useEffect(() => {
      if (!shouldHandleKeyboard) return

      const showSub = Keyboard.addListener('keyboardWillShow', (e) => {
        const height = Math.max(0, e.endCoordinates.height - bottomInset)
        keyboardHeight.value = withTiming(height, {
          duration: e.duration || 250,
          easing: Easing.out(Easing.ease),
        })
      })
      const hideSub = Keyboard.addListener('keyboardWillHide', (e) => {
        keyboardHeight.value = withTiming(0, {
          duration: e.duration || 250,
          easing: Easing.in(Easing.ease),
        })
      })

      return () => {
        showSub.remove()
        hideSub.remove()
      }
    }, [shouldHandleKeyboard, bottomInset])

    const [renderSheet, setRenderSheet] = useState(isVisible)
    const [searchResetKey, setSearchResetKey] = useState(0)

    // ── Snap computation (all derived on UI thread) ──

    const snapPoint = snapPointProp ?? 0.6
    const isDynamic = !snapPointsProp && snapPointProp === undefined

    const sortedSnaps = useMemo(
      () =>
        snapPointsProp
          ? [...snapPointsProp].sort((a, b) => a - b)
          : [snapPoint],
      [snapPointsProp, snapPoint]
    )

    const staticMaxHeight = isDynamic
      ? SCREEN_HEIGHT * 0.6
      : Math.min(
          SCREEN_HEIGHT * sortedSnaps[sortedSnaps.length - 1],
          maxAllowedHeight
        )

    // Shared values — single source of truth for UI thread
    const maxSheetHeightSV = useSharedValue(staticMaxHeight)
    const sortedSnapsUI = useSharedValue<number[]>(sortedSnaps)
    const snapsUI = useSharedValue<number[]>(
      computeSnapPositions(sortedSnaps, staticMaxHeight, SCREEN_HEIGHT)
    )
    const dismissAtUI = useSharedValue(staticMaxHeight * 0.6)

    // Sync props → shared values (only when props change)
    useEffect(() => {
      sortedSnapsUI.value = sortedSnaps
      if (!isDynamic) {
        maxSheetHeightSV.value = staticMaxHeight
      }
    }, [sortedSnaps, staticMaxHeight, isDynamic])

    // Derive snap positions on UI thread when maxHeight changes
    useAnimatedReaction(
      () => maxSheetHeightSV.value,
      (maxH) => {
        const snaps = sortedSnapsUI.value
        const result: number[] = []
        for (let i = 0; i < snaps.length; i++) {
          result.push(maxH - SCREEN_HEIGHT * snaps[i])
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

    // ── Dynamic height: measure() on UI thread ──

    const contentRef = useAnimatedRef<Animated.View>()
    const hasMeasured = useSharedValue(false)

    // Reset measurement flag when sheet closes
    useEffect(() => {
      if (!renderSheet) {
        hasMeasured.value = false
      }
    }, [renderSheet])

    // Measure content on UI thread (no JS roundtrip for initial layout)
    useAnimatedReaction(
      () => translateY.value,
      () => {
        if (!isDynamic || hasMeasured.value) return
        const m = measure(contentRef)
        if (m && m.height > 0) {
          hasMeasured.value = true
          maxSheetHeightSV.value = Math.min(m.height, maxAllowedHeight)
        }
      }
    )

    // Fallback: onLayout → shared value for subsequent size changes (no setState)
    const handleContentLayout = useCallback(
      (e: { nativeEvent: { layout: { height: number } } }) => {
        if (!isDynamic) return
        const h = e.nativeEvent.layout.height
        if (h > 0) {
          maxSheetHeightSV.value = Math.min(h, maxAllowedHeight)
        }
      },
      [isDynamic, maxSheetHeightSV]
    )

    // ── Callbacks ──

    const notifyAnimate = useCallback(
      (target: number) => {
        onAnimate?.(target, maxSheetHeightSV.value)
      },
      [onAnimate, maxSheetHeightSV]
    )

    const handleDismissComplete = useCallback(() => {
      keyboardHeight.value = 0
      setRenderSheet(false)
      onClose?.()
    }, [onClose, keyboardHeight])

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

      if (keyboardBehavior === 'height') {
        return {
          height: maxSheetHeightSV.value + kbH,
          transform: [{ translateY: translateY.value }],
        }
      }

      if (keyboardBehavior === 'padding') {
        return {
          height: maxSheetHeightSV.value,
          transform: [{ translateY: translateY.value - kbH }],
        }
      }

      // 'none'
      return {
        height: maxSheetHeightSV.value,
        transform: [{ translateY: translateY.value }],
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
              paddingBottom: bottomInset,
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
    bottom: 0,
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
