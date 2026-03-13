import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useImperativeHandle,
  forwardRef,
} from 'react'
import {
  StyleSheet,
  View,
  Pressable,
  TouchableOpacity,
  Text,
  Image,
  FlatList,
} from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedRef,
  useAnimatedScrollHandler,
  interpolate,
  Extrapolation,
  scrollTo,
  withSpring,
  runOnJS,
  useAnimatedKeyboard,
} from 'react-native-reanimated'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'

import type { BottomSheetProps, BottomSheetRef } from './types'
import type { BottomSheetScrollContext } from './context'
import { BottomSheetScrollCtx } from './context'
import { SearchBar } from './SearchBar'
import { SCREEN_HEIGHT, SNAP_SPRING, DEFAULT_THEME } from './constants'
import { rubberBand, findTargetSnap } from './worklets'

/** Optional haptic feedback helper */
const triggerHaptic = () => {
  try {
    // Try to use react-native-haptic-feedback if available
    const Haptic = require('react-native-haptic-feedback').default
    Haptic.trigger('impactLight', {
      enableVibrateFallback: false,
      ignoreAndroidSystemSettings: false,
    })
  } catch {
    try {
      // Try to use expo-haptics if available
      const ExpoHaptics = require('expo-haptics')
      if (ExpoHaptics.impactAsync) {
        ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light)
      }
    } catch {
      // No haptic library found
    }
  }
}

function useBottomInset(): number {
  try {
    const { useSafeAreaInsets } = require('react-native-safe-area-context')
    return useSafeAreaInsets().bottom
  } catch {
    return 0
  }
}

export const BottomSheet = forwardRef<BottomSheetRef, BottomSheetProps>(
  (
    {
      isVisible,
      onClose,
      title,
      children,
      containerStyle,
      snapPoints: snapPointsProp,
      snapPoint = 0.6,
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
    const keyboard = useAnimatedKeyboard()
    const colors = { ...DEFAULT_THEME, ...themeProp }
    const bottomInset = useBottomInset()

    const [renderSheet, setRenderSheet] = useState(isVisible)
    const [searchResetKey, setSearchResetKey] = useState(0)
    const [contentHeight, setContentHeight] = useState(SCREEN_HEIGHT * 0.6) // default fallback

    const sortedSnaps = snapPointsProp
      ? [...snapPointsProp].sort((a, b) => a - b)
      : [snapPoint]

    const isDynamic = !snapPointsProp && !snapPoint

    const effectiveMaxHeight = isDynamic
      ? contentHeight
      : SCREEN_HEIGHT * sortedSnaps[sortedSnaps.length - 1]

    const maxSheetHeight = Math.min(effectiveMaxHeight, SCREEN_HEIGHT * 0.95)

    const snapTranslateY = sortedSnaps
      .map((s) => maxSheetHeight - SCREEN_HEIGHT * s)
      .sort((a, b) => a - b)

    const initialTranslateY =
      snapTranslateY[Math.min(initialSnapIndex, snapTranslateY.length - 1)]

    const dismissThreshold = maxSheetHeight * 0.4

    const snapsUI = useSharedValue<number[]>(snapTranslateY)
    const dismissAtUI = useSharedValue(maxSheetHeight - dismissThreshold)

    const translateY = useSharedValue(maxSheetHeight)
    const context = useSharedValue(0)

    const scrollOffset = useSharedValue(0)
    const scrollRef = useAnimatedRef<FlatList<any>>()

    const isSheetDragging = useSharedValue(false)
    const dragStartY = useSharedValue(0)

    Animated.useDerivedValue(() => {
      if (onAnimate) {
        runOnJS(onAnimate)(translateY.value, maxSheetHeight)
      }
    })

    const open = useCallback(() => {
      setRenderSheet(true)
      translateY.value = withSpring(initialTranslateY, SNAP_SPRING)
    }, [initialTranslateY, translateY])

    const close = useCallback(() => {
      translateY.value = withSpring(maxSheetHeight, SNAP_SPRING, (finished) => {
        if (finished) {
          runOnJS(setRenderSheet)(false)
          if (onClose) runOnJS(onClose)()
        }
      })
    }, [maxSheetHeight, onClose, translateY])

    useImperativeHandle(ref, () => ({
      expand: (index?: number) => {
        const target =
          index !== undefined
            ? snapTranslateY[Math.min(index, snapTranslateY.length - 1)]
            : snapTranslateY[0]
        translateY.value = withSpring(target, SNAP_SPRING)
      },
      collapse: () => {
        translateY.value = withSpring(
          snapTranslateY[snapTranslateY.length - 1],
          SNAP_SPRING
        )
      },
      close: () => {
        close()
      },
      snapTo: (index: number) => {
        const target = snapTranslateY[Math.min(index, snapTranslateY.length - 1)]
        translateY.value = withSpring(target, SNAP_SPRING)
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
    }, [isVisible, renderSheet, open, close, onSearch])

    const scrollHandler = useAnimatedScrollHandler({
      onScroll: (event) => {
        scrollOffset.value = event.contentOffset.y
      },
    })

    const headerGesture = Gesture.Pan()
      .activeOffsetY([-4, 4])
      .onStart(() => {
        context.value = translateY.value
      })
      .onUpdate((e) => {
        let newY = context.value + e.translationY

        if (newY < 0) {
          newY = -rubberBand(-newY, maxSheetHeight * 0.25)
        }

        translateY.value = newY
      })
      .onEnd((e) => {
        if (translateY.value < 0) {
          translateY.value = withSpring(0, SNAP_SPRING)
          return
        }

        const target = findTargetSnap(
          translateY.value,
          e.velocityY,
          snapsUI.value,
          dismissAtUI.value
        )

        if (target >= dismissAtUI.value) {
          runOnJS(close)()
        } else {
          const index = snapsUI.value.indexOf(target)
          if (onSnap) runOnJS(onSnap)(index)
          if (enableHaptics) runOnJS(triggerHaptic)()
          translateY.value = withSpring(target, SNAP_SPRING)
        }
      })

    const contentPanGesture = Gesture.Pan()
      .activeOffsetY([-4, 4])
      .onStart(() => {
        isSheetDragging.value = false
        context.value = translateY.value
      })
      .onUpdate((e) => {
        const atTop = scrollOffset.value <= 1
        const pullingDown = e.translationY > 0

        if (!isSheetDragging.value && atTop && pullingDown) {
          isSheetDragging.value = true
          dragStartY.value = e.absoluteY
          context.value = translateY.value

          scrollTo(scrollRef, 0, 0, false)
        }

        if (isSheetDragging.value) {
          const delta = e.absoluteY - dragStartY.value

          if (delta < -8) {
            translateY.value = context.value
            isSheetDragging.value = false
            return
          }

          translateY.value = context.value + Math.max(0, delta)
        }
      })
      .onEnd((e: any) => {
        if (!isSheetDragging.value) return

        const target = findTargetSnap(
          translateY.value,
          e.velocityY,
          snapsUI.value,
          dismissAtUI.value
        )

        if (target >= dismissAtUI.value) {
          runOnJS(close)()
        } else {
          const index = snapsUI.value.indexOf(target)
          if (onSnap) runOnJS(onSnap)(index)
          if (enableHaptics) runOnJS(triggerHaptic)()
          translateY.value = withSpring(target, SNAP_SPRING)
        }

        isSheetDragging.value = false
      })

    const nativeScrollGesture = Gesture.Native()
    const contentGesture = Gesture.Simultaneous(
      contentPanGesture,
      nativeScrollGesture
    )

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

    const sheetStyle = useAnimatedStyle(() => {
      const keyboardOffset =
        keyboardBehavior === 'padding' ? keyboard.height.value : 0

      return {
        transform: [{ translateY: translateY.value - keyboardOffset }],
      }
    })

    const backdropStyle = useAnimatedStyle(() => ({
      opacity: interpolate(
        translateY.value,
        [0, maxSheetHeight],
        [1, 0],
        Extrapolation.CLAMP
      ),
    }))

    if (!renderSheet && !isVisible) return null

    return (
      <View style={StyleSheet.absoluteFill}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close}>
          <Animated.View
            style={[
              styles.backdrop,
              { backgroundColor: colors.backdropColor },
              backdropStyle,
            ]}
          />
        </Pressable>

        <Animated.View
          style={[
            styles.sheet,
            {
              height: maxSheetHeight,
              backgroundColor: colors.backgroundColor,
              paddingBottom: bottomInset,
            },
            containerStyle,
            sheetStyle,
          ]}
          accessibilityLabel={accessibilityLabel}
          accessibilityRole={accessibilityRole as any}
        >
          <GestureDetector gesture={headerGesture}>
            <Animated.View>
              {showHandle && (
                <View style={styles.handleContainer}>
                  <View
                    style={[
                      styles.handle,
                      { backgroundColor: colors.handleColor },
                    ]}
                  />
                </View>
              )}

              {(title || showCloseButton) && (
                <View style={styles.header}>
                  <Text style={[styles.title, { color: colors.textColor }]}>
                    {title}
                  </Text>

                  {showCloseButton &&
                    (renderCloseButton ? (
                      renderCloseButton(close)
                    ) : (
                      <TouchableOpacity
                        onPress={close}
                        accessibilityLabel={closeButtonAccessibilityLabel}
                        accessibilityRole="button"
                      >
                        <Image
                          source={require('./assets/icon-close.png')}
                          style={{
                            width: 24,
                            height: 24,
                            tintColor: colors.textColor,
                          }}
                        />
                      </TouchableOpacity>
                    ))}
                </View>
              )}
            </Animated.View>
          </GestureDetector>

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

          <BottomSheetScrollCtx.Provider value={ctxRef.current}>
            <View
              style={styles.content}
              onLayout={(e) => {
                if (!snapPointsProp) {
                  const h = e.nativeEvent.layout.height
                  if (h > 0 && Math.abs(h - contentHeight) > 1) {
                    setContentHeight(h)
                  }
                }
              }}
            >
              {children}
            </View>
          </BottomSheetScrollCtx.Provider>
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
})
