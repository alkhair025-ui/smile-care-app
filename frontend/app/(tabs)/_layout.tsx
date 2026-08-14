import React from 'react';
import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { colors, font, fontFamily } from '@/src/theme';

function TabIcon({ name, color, focused, label }: { name: any; color: string; focused: boolean; label: string }) {
  return (
    <View style={styles.tabItem}>
      <Feather name={name} size={22} color={color} />
      <Text style={[styles.tabLabel, { color, fontFamily: focused ? fontFamily.bold : fontFamily.regular }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.divider,
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingTop: 8,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          tabBarIcon: ({ color, focused }) => <TabIcon name="grid" color={color} focused={focused} label="الرئيسية" />,
        }}
      />
      <Tabs.Screen
        name="patients"
        options={{
          tabBarIcon: ({ color, focused }) => <TabIcon name="users" color={color} focused={focused} label="المرضى" />,
        }}
      />
      <Tabs.Screen
        name="appointments"
        options={{
          tabBarIcon: ({ color, focused }) => <TabIcon name="calendar" color={color} focused={focused} label="المواعيد" />,
        }}
      />
      <Tabs.Screen
        name="invoices"
        options={{
          tabBarIcon: ({ color, focused }) => <TabIcon name="file-text" color={color} focused={focused} label="الفواتير" />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          tabBarIcon: ({ color, focused }) => <TabIcon name="more-horizontal" color={color} focused={focused} label="المزيد" />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabItem: { alignItems: 'center', justifyContent: 'center', gap: 2, minWidth: 60 },
  tabLabel: { fontSize: 11 },
});
