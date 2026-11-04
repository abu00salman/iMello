/**
 * iMello app shell.
 *
 * Hosts the iMello web client — the same end-to-end-encrypted client (matrix-js-sdk + Rust crypto
 * compiled to WebAssembly) that is covered by the automated tests — inside a native WebView, with
 * native microphone/photo permissions, Android back navigation and external links opened in the
 * system browser. Keys and session live in the WebView's persistent, app-private storage.
 *
 * A fully native crypto client (matrix-rust-sdk) is planned; see docs/ARCHITECTURE.md §6.
 */
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Linking, PermissionsAndroid, Platform, Pressable, Text, useColorScheme, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { WebView as RNWebView, type WebViewNavigation, type WebViewProps } from "react-native-webview";
import type { ComponentType, Ref } from "react";

// react-native-webview's class typings resolve a different @types/react copy in this monorepo;
// re-type the component once instead of casting every prop.
const WebView = RNWebView as unknown as ComponentType<WebViewProps & { ref?: Ref<RNWebView> }>;

const WEB_URL: string = (Constants.expoConfig?.extra?.webUrl as string | undefined) ?? "https://abu00salman.github.io/iMello/app/";
const WEB_ORIGIN = new URL(WEB_URL).origin;

// Show message banners even while the app is in the foreground (the web client only asks when the
// user is not already looking at that conversation).
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
});

interface BridgeMessage {
  type: "notify" | "requestNotificationPermission" | "badge" | "saveFile" | "theme";
  name?: string;
  content?: string;
  title?: string;
  body?: string;
  roomId?: string;
  count?: number;
  dark?: boolean;
}

export default function Shell() {
  const systemDark = useColorScheme() === "dark";
  const [webTheme, setWebTheme] = useState<"dark" | "light" | null>(null);
  const dark = webTheme ? webTheme === "dark" : systemDark;
  const bg = dark ? "#0E1015" : "#F7F8FB";
  const web = useRef<RNWebView>(null);
  const canGoBack = useRef(false);
  const [failed, setFailed] = useState(false);
  const [key, setKey] = useState(0);

  // Android: the WebView can only use the microphone if the app holds the runtime permission.
  useEffect(() => {
    if (Platform.OS === "android") void PermissionsAndroid.requestMultiple([PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, PermissionsAndroid.PERMISSIONS.CAMERA]);
  }, []);

  // Tapping a notification opens that conversation.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const roomId = res.notification.request.content.data?.roomId;
      if (typeof roomId === "string") {
        web.current?.injectJavaScript(`location.hash = ${JSON.stringify(`#/chats/${encodeURIComponent(roomId)}`)}; true;`);
      }
    });
    return () => sub.remove();
  }, []);

  async function onBridge(raw: string) {
    let msg: BridgeMessage;
    try {
      msg = JSON.parse(raw) as BridgeMessage;
    } catch {
      return;
    }
    if (msg.type === "requestNotificationPermission") {
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("messages", { name: "Messages", importance: Notifications.AndroidImportance.HIGH });
      }
      await Notifications.requestPermissionsAsync();
    } else if (msg.type === "notify" && msg.title) {
      await Notifications.scheduleNotificationAsync({
        content: { title: msg.title, body: msg.body ?? "", data: { roomId: msg.roomId }, sound: true },
        trigger: Platform.OS === "android" ? { channelId: "messages" } : null,
      });
    } else if (msg.type === "saveFile" && msg.name && msg.content) {
      // Written to the app's private cache, then handed to the share sheet so the user saves it
      // where they choose (Files, iCloud Drive, a USB drive…). Nothing is uploaded by iMello.
      const safeName = msg.name.replace(/[^\w.-]/g, "_");
      const file = new File(Paths.cache, safeName);
      if (file.exists) file.delete();
      file.create();
      file.write(msg.content);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: "text/plain", dialogTitle: safeName });
    } else if (msg.type === "theme") {
      setWebTheme(msg.dark ? "dark" : "light");
    } else if (msg.type === "badge" && typeof msg.count === "number") {
      await Notifications.setBadgeCountAsync(msg.count).catch(() => undefined);
    }
  }

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack.current) {
        web.current?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, []);

  /** Stay inside iMello; anything else (http links in messages, GitHub, etc.) opens in the browser. */
  function allow(req: WebViewNavigation): boolean {
    const url = req.url;
    if (url.startsWith("blob:") || url.startsWith("data:") || url === "about:blank") return false;
    if (url.startsWith(WEB_ORIGIN)) return true;
    void Linking.openURL(url);
    return false;
  }

  if (failed) {
    const ar = (Constants.expoConfig?.extra?.lang ?? "") === "ar" || /^ar/i.test(Intl.DateTimeFormat().resolvedOptions().locale);
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: bg, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 }}>
        <Text style={{ color: dark ? "#F2F4F8" : "#171A21", fontSize: 18, textAlign: "center" }}>
          {ar ? "تعذّر الاتصال بآي ميلو. تحقق من الإنترنت." : "Can't reach iMello. Check your connection."}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setFailed(false);
            setKey((k) => k + 1);
          }}
          style={{ backgroundColor: "#3D7FE0", borderRadius: 999, paddingHorizontal: 28, paddingVertical: 12 }}
        >
          <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>{ar ? "إعادة المحاولة" : "Try again"}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    // iOS: edge-to-edge — the web client draws under the status bar (env(safe-area-inset-top)).
    <SafeAreaView edges={Platform.OS === "ios" ? [] : ["top"]} style={{ flex: 1, backgroundColor: bg }}>
      <StatusBar style={dark ? "light" : "dark"} />
      <WebView
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        key={key}
        ref={web}
        source={{ uri: WEB_URL }}
        style={{ flex: 1, backgroundColor: bg }}
        originWhitelist={[WEB_ORIGIN, "https://*"]}
        onShouldStartLoadWithRequest={allow}
        onMessage={(e) => void onBridge(e.nativeEvent.data)}
        onNavigationStateChange={(s) => (canGoBack.current = s.canGoBack)}
        onError={() => setFailed(true)}
        onHttpError={(e) => e.nativeEvent.statusCode >= 500 && setFailed(true)}
        startInLoadingState
        renderLoading={() => (
          <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", backgroundColor: bg }}>
            <ActivityIndicator size="large" color="#3D7FE0" />
          </View>
        )}
        // Persistence & media
        domStorageEnabled
        javaScriptEnabled
        sharedCookiesEnabled={false}
        incognito={false}
        cacheEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        mediaCapturePermissionGrantType="grant"
        allowFileAccess={false}
        allowsBackForwardNavigationGestures
        setSupportMultipleWindows={false}
        pullToRefreshEnabled={false}
        bounces={false}
        overScrollMode="never"
        textZoom={100}
        applicationNameForUserAgent="iMelloApp/1.0"
        // Security: no mixed content, no third-party cookies, no geolocation.
        mixedContentMode="never"
        thirdPartyCookiesEnabled={false}
        geolocationEnabled={false}
      />
    </SafeAreaView>
  );
}
