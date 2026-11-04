import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Platform, View } from "react-native";
import { WebView as RNWebView, type WebViewProps } from "react-native-webview";
import type { ComponentType, Ref } from "react";

const WebView = RNWebView as unknown as ComponentType<WebViewProps & { ref?: Ref<RNWebView> }>;

/** Stable https origin for IndexedDB. The page itself is the local bundle, not a website. */
export const ENGINE_ORIGIN = "https://imello.engine.local/";

/**
 * Invisible WebView. It is a 1px engine, clipped so it cannot be seen or tapped.
 * A zero-size view can pause JavaScript on Android, so the pixel stays in the tree.
 */
export function EngineView({ webRef, onMessage }: { webRef: RefObject<RNWebView | null>; onMessage: (raw: string) => void }) {
  const [html, setHtml] = useState<string | null>(null);
  const failed = useRef(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const asset = Asset.fromModule(require("../../assets/engine/index.html"));
      if (!asset.localUri) await asset.downloadAsync();
      const uri = asset.localUri ?? asset.uri;
      const text = await new File(uri).text();
      if (live) setHtml(text);
    })().catch(() => {
      failed.current = true;
      if (live) onMessage(JSON.stringify({ v: 1, kind: "evt", event: "engine-error", data: { code: "engine_missing", message: "engine_missing" } }));
    });
    return () => {
      live = false;
    };
  }, [onMessage]);

  if (!html) return null;
  return (
    <View
      collapsable={false}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0.01 }}
    >
      <WebView
        ref={webRef}
        source={{ html, baseUrl: ENGINE_ORIGIN }}
        style={{ width: 1, height: 1 }}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        incognito={false}
        cacheEnabled
        sharedCookiesEnabled={false}
        thirdPartyCookiesEnabled={false}
        mixedContentMode="never"
        geolocationEnabled={false}
        setSupportMultipleWindows={false}
        allowFileAccess={false}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        textZoom={100}
        androidLayerType={Platform.OS === "android" ? "hardware" : undefined}
        onMessage={(event) => onMessage(event.nativeEvent.data)}
        onError={() => onMessage(JSON.stringify({ v: 1, kind: "evt", event: "engine-error", data: { code: "engine_crash", message: "engine_crash" } }))}
      />
    </View>
  );
}
