import {
  clear,
  createButton,
  createSection,
  el,
  ensureSnapshot,
  formField,
  select,
  textInput,
  toggleLoading,
} from "../ui.js";

const defaultSettings = {
  locale: "ja-JP",
  timezone: "Asia/Tokyo",
  member_index_mode: "exclude_bots",
  member_count_strategy: "human_only",
  api_base_url: "",
  show_join_alerts: true,
};

export async function renderSettings({ state, root, showToast }) {
  const snapshot = await ensureSnapshot(state, root).catch(() => null);
  if (!snapshot) {
    return;
  }

  const settings = { ...defaultSettings, ...(snapshot.settings || {}) };

  const section = createSection("共通設定", "複数機能に跨る共通オプションを管理します。");
  const form = el("form");
  const localeSelect = select({
    value: settings.locale,
    options: [
      { value: "ja-JP", label: "日本語" },
      { value: "en-US", label: "English" },
    ],
  });
  const timezoneSelect = select({
    value: settings.timezone,
    options: [
      { value: "Asia/Tokyo", label: "JST" },
      { value: "UTC", label: "UTC" },
    ],
  });
  const memberIndexSelect = select({
    value: settings.member_index_mode,
    options: [
      { value: "exclude_bots", label: "Botを除外" },
      { value: "include_bots", label: "Botを含める" },
    ],
  });
  const memberCountSelect = select({
    value: settings.member_count_strategy,
    options: [
      { value: "human_only", label: "人間のみ" },
      { value: "all_members", label: "全メンバー" },
      { value: "boosters_priority", label: "ブースター優先" },
    ],
  });
  const apiBaseInput = textInput({ value: settings.api_base_url || "", placeholder: "API Base URL (Pages向け表示)" });
  const joinAlertsToggle = el("input", { type: "checkbox" });
  joinAlertsToggle.checked = settings.show_join_alerts !== false;

  form.append(
    formField("言語", localeSelect),
    formField("時刻帯", timezoneSelect),
    formField("メンバー番号のカウント", memberIndexSelect),
    formField("メンバー数の算出方法", memberCountSelect),
    formField("Pages表示用API URL", apiBaseInput),
    formField("Join通知を表示", joinAlertsToggle),
    el("div", { className: "inline-actions" }, createButton("保存", { type: "submit" })),
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      locale: localeSelect.value,
      timezone: timezoneSelect.value,
      member_index_mode: memberIndexSelect.value,
      member_count_strategy: memberCountSelect.value,
      api_base_url: apiBaseInput.value.trim() || null,
      show_join_alerts: joinAlertsToggle.checked,
    };

    toggleLoading(form, true);
    try {
      const data = await state.request("/api/settings.save", payload);
      if (data.settings) {
        state.updateSnapshot("settings", data.settings);
      }
      showToast("共通設定を保存しました。", "success");
      clear(root);
      await renderSettings({ state, root, showToast });
    } catch (error) {
      showToast(error.message || "保存に失敗しました。", "error");
    } finally {
      toggleLoading(form, false);
    }
  });

  section.append(form);
  root.append(section);
}
