import { MIN_PASSWORD_LENGTH } from "@imello/core";
import { getDocumentAsync } from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import { EncodingType, readAsStringAsync } from "expo-file-system/legacy";
import { router } from "expo-router";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { Text, View } from "react-native";
import { RpcError } from "../src/rpc/protocol";
import { usePrefs } from "../src/prefs/Prefs";
import { useSession } from "../src/session/Session";
import { Field, Header, Icon, IconButton, PrimaryButton } from "../src/ui/chrome";

export default function Backup() {
  const { colors, font, t } = usePrefs();
  const { exportKeys, importKeys } = useSession();
  const [pass, setPass] = useState("");
  const [again, setAgain] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setNote(null);
    if (pass.length < MIN_PASSWORD_LENGTH) return setNote(t("tooShort"));
    if (pass !== again) return setNote(t("mismatch"));
    setBusy(true);
    try {
      const body = await exportKeys(pass);
      const file = new File(Paths.cache, `imello-backup-${new Date().toISOString().slice(0, 10)}.txt`);
      if (file.exists) file.delete();
      file.create();
      file.write(body);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: "text/plain" });
      setPass("");
      setAgain("");
      setNote(t("backupSaved"));
    } catch {
      setNote(t("serverDown"));
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    const picked = await getDocumentAsync({ copyToCacheDirectory: true, type: "text/plain" });
    if (picked.canceled) return;
    const asset = picked.assets[0];
    if (!asset?.uri) return;
    const secret = pass;
    if (secret.length < MIN_PASSWORD_LENGTH) return setNote(t("tooShort"));
    setBusy(true);
    try {
      const text = await readAsStringAsync(asset.uri, { encoding: EncodingType.UTF8 });
      const n = await importKeys(text, secret);
      setNote(t("backupRestored", { n }));
    } catch (err) {
      setNote(err instanceof RpcError && err.code === "wrong_passphrase" ? t("wrongPass") : t("serverDown"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.grouped }}>
      <Header title={t("backup")} leading={<IconButton label={t("cancel")} onPress={() => router.back()}><Icon ios="chevron.backward" android="arrow_back" color="#fff" mirror /></IconButton>} />
      <View style={{ padding: 16, gap: 12 }}>
        <Text style={{ color: colors.text2, fontFamily: font("400"), lineHeight: 20 }}>{t("backupBody")}</Text>
        <Field value={pass} onChangeText={setPass} placeholder={t("backupPass")} secure ltr />
        <Field value={again} onChangeText={setAgain} placeholder={t("confirmPass")} secure ltr />
        {note ? <Text style={{ color: colors.primary, fontFamily: font("500") }}>{note}</Text> : null}
        <PrimaryButton label={t("saveBackup")} onPress={() => void save()} busy={busy} />
        <PrimaryButton label={t("restore")} onPress={() => void restore()} busy={busy} fill={colors.surface2} />
      </View>
    </View>
  );
}
