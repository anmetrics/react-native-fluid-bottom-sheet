import React, { memo, useCallback, useEffect, useState } from 'react'
import {
  StyleSheet,
  View,
  TextInput,
  TouchableOpacity,
  Text,
} from 'react-native'
import type { BottomSheetTheme } from './types'
import { DEFAULT_THEME } from './constants'

interface SearchBarProps {
  searchPlaceholder?: string
  onSearch?: (query: string) => void
  onReset: number
  theme?: BottomSheetTheme
  renderSearchIcon?: () => React.ReactNode
  renderClearIcon?: () => React.ReactNode
}

function SearchBarComponent({
  searchPlaceholder,
  onSearch,
  onReset,
  theme,
  renderSearchIcon,
  renderClearIcon,
}: SearchBarProps) {
  const colors = { ...DEFAULT_THEME, ...theme }
  const [query, setQuery] = useState('')

  const handleChange = useCallback(
    (text: string) => {
      setQuery(text)
      onSearch?.(text)
    },
    [onSearch]
  )

  const handleClear = useCallback(() => {
    setQuery('')
    onSearch?.('')
  }, [onSearch])

  useEffect(() => {
    setQuery('')
  }, [onReset])

  return (
    <View
      style={[
        styles.searchContainer,
        { backgroundColor: colors.searchBackgroundColor },
      ]}
    >
      {renderSearchIcon ? (
        renderSearchIcon()
      ) : (
        <Text style={{ fontSize: 16, color: colors.searchPlaceholderColor }}>
          🔍
        </Text>
      )}

      <TextInput
        style={[styles.searchInput, { color: colors.searchTextColor }]}
        placeholder={searchPlaceholder}
        placeholderTextColor={colors.searchPlaceholderColor}
        value={query}
        onChangeText={handleChange}
      />

      {query.length > 0 && (
        <TouchableOpacity onPress={handleClear}>
          {renderClearIcon ? (
            renderClearIcon()
          ) : (
            <Text
              style={{ fontSize: 16, color: colors.searchPlaceholderColor }}
            >
              ✕
            </Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  )
}

export const SearchBar = memo(SearchBarComponent)

const styles = StyleSheet.create({
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    marginLeft: 8,
  },
})
