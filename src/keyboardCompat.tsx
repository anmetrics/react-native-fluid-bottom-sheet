/**
 * Shim for `react-native-keyboard-controller`.
 *
 * Native path  (bare RN / EAS build): `useKeyboardHandler` worklet callbacks
 * fire on the UI thread, frame-perfect, including Android keyboard type-swaps.
 *
 * Fallback path (Expo Go / module not linked): `useAnimatedKeyboard` from
 * Reanimated — also UI thread, smooth, but does not catch in-place keyboard
 * type-swaps on Android (text ↔ phone-pad stays at old height until dismiss).
 */
import React from 'react'
import { Platform } from 'react-native'
import {
  useSharedValue,
  useAnimatedKeyboard,
  useAnimatedReaction,
  withTiming,
  cancelAnimation,
  type SharedValue,
} from 'react-native-reanimated'
import type { ComponentType, ReactNode } from 'react'

const IS_IOS = Platform.OS === 'ios'

// ─── Native module load ───────────────────────────────────────────────────────

type NativeMod = {
  useKeyboardHandler: (
    handlers: {
      onStart?: (e: { height: number; duration: number }) => void
      onMove?: (e: { height: number }) => void
      onEnd?: (e: { height: number }) => void
      onInteractive?: (e: { height: number }) => void
    },
    deps?: readonly unknown[]
  ) => void
  KeyboardController: {
    isVisible: () => boolean
    state: () => { height: number }
  }
  KeyboardProvider: ComponentType<{ children?: ReactNode }>
}

let _mod: NativeMod | null = null
try {
  _mod = require('react-native-keyboard-controller') as NativeMod
} catch {
  _mod = null
}

// ─── Native path ──────────────────────────────────────────────────────────────

function useKbHeightNative(active: boolean): SharedValue<number> {
  const { useKeyboardHandler, KeyboardController } = _mod!

  const kbDriven = useSharedValue(
    KeyboardController.isVisible() ? KeyboardController.state().height : 0
  )

  useKeyboardHandler(
    {
      onStart: (e) => {
        'worklet'
        if (!active || !IS_IOS) return
        kbDriven.value = withTiming(e.height, {
          duration: e.duration > 0 ? e.duration : 250,
        })
      },
      onMove: (e) => {
        'worklet'
        if (!active || IS_IOS) return
        cancelAnimation(kbDriven)
        kbDriven.value = e.height
      },
      onEnd: (e) => {
        'worklet'
        if (!active || IS_IOS) return
        kbDriven.value = e.height
      },
      onInteractive: (e) => {
        'worklet'
        if (!active) return
        cancelAnimation(kbDriven)
        kbDriven.value = e.height
      },
    },
    [active]
  )

  return kbDriven
}

// ─── Fallback path (Expo Go) ──────────────────────────────────────────────────

function useKbHeightFallback(active: boolean): SharedValue<number> {
  const animatedKeyboard = useAnimatedKeyboard({
    isStatusBarTranslucentAndroid: true,
    isNavigationBarTranslucentAndroid: true,
  })

  const kbDriven = useSharedValue(0)

  useAnimatedReaction(
    () => (active ? animatedKeyboard.height.value : 0),
    (value) => {
      kbDriven.value = value
    },
    [active]
  )

  return kbDriven
}

// ─── Driver config ────────────────────────────────────────────────────────────

type KeyboardDriver = 'auto' | 'reanimated'
let _driver: KeyboardDriver = 'auto'

/**
 * Override which keyboard tracking implementation the sheet uses.
 *
 * - `'auto'` (default) — use `react-native-keyboard-controller` when linked,
 *   fall back to Reanimated's `useAnimatedKeyboard` otherwise (Expo Go).
 * - `'reanimated'` — always use `useAnimatedKeyboard`, even when
 *   `react-native-keyboard-controller` is installed. Useful when you prefer
 *   not to link the native module, or to normalise behaviour across envs.
 *
 * Call once at app startup, before any sheet renders.
 */
export function configureKeyboardDriver(driver: KeyboardDriver): void {
  _driver = driver
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export function useKbHeight(active: boolean): SharedValue<number> {
  const useNative = _mod !== null && _driver !== 'reanimated'
  // `useNative` is stable for the component lifetime: `_mod` is set at module
  // load and `_driver` should be configured once before any sheet mounts.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useNative ? useKbHeightNative(active) : useKbHeightFallback(active)
}

export function getInitialKbVisible(): boolean {
  return _mod ? _mod.KeyboardController.isVisible() : false
}

export const KeyboardProvider: ComponentType<{ children?: ReactNode }> = _mod
  ? _mod.KeyboardProvider
  : ({ children }) => <>{children}</>
