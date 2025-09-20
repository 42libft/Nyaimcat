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

const defaultScrim = {
  timezone: "Asia/Tokyo",
  manager_role_id: "",
  rules: [],
};

function createRuleRow(container, initial = {}) {
  const row = el("div", { className: "rule-row" });
  const daySelect = select({
    value: initial.day || "sun",
    options: [
      { value: "sun", label: "日曜" },
      { value: "mon", label: "月曜" },
      { value: "tue", label: "火曜" },
      { value: "wed", label: "水曜" },
      { value: "thu", label: "木曜" },
      { value: "fri", label: "金曜" },
      { value: "sat", label: "土曜" },
    ],
  });
  daySelect.dataset.field = "day";
  const openInput = textInput({ type: "number", value: initial.survey_open_hour ?? 12, placeholder: "開始時刻" });
  openInput.dataset.field = "survey_open_hour";
  const closeInput = textInput({ type: "number", value: initial.survey_close_hour ?? 22, placeholder: "締切時刻" });
  closeInput.dataset.field = "survey_close_hour";
  const notifyInput = textInput({ value: initial.notify_channel_id || "", placeholder: "通知チャンネルID" });
  notifyInput.dataset.field = "notify_channel_id";
  const minMembersInput = textInput({ type: "number", value: initial.min_team_members ?? 3, placeholder: "必要メンバー" });
  minMembersInput.dataset.field = "min_team_members";

  row.append(
    formField("曜日", daySelect),
    formField("募集開始時刻", openInput),
    formField("締切時刻", closeInput),
    formField("通知チャンネルID", notifyInput),
    formField("必要メンバー数", minMembersInput),
  );

  const removeBtn = createButton("削除", { variant: "secondary" });
  removeBtn.addEventListener("click", () => row.remove());
  row.append(el("div", { className: "inline-actions" }, removeBtn));
  container.append(row);
}

export async function renderScrims({ state, root, showToast }) {
  const snapshot = await ensureSnapshot(state, root).catch(() => null);
  if (!snapshot) {
    return;
  }

  const config = { ...defaultScrim, ...(snapshot.scrims || {}) };

  const section = createSection("スクリム補助", "週間スクリム設定を管理します。");
  const form = el("form");
  const timezoneSelect = select({
    value: config.timezone || "Asia/Tokyo",
    options: [
      { value: "Asia/Tokyo", label: "JST" },
      { value: "UTC", label: "UTC" },
    ],
  });
  const managerRoleInput = textInput({ value: config.manager_role_id || "", placeholder: "マネージャーロールID (任意)" });

  form.append(
    formField("タイムゾーン", timezoneSelect),
    formField("マネージャーロールID", managerRoleInput),
  );

  const rulesContainer = el("div", { className: "rule-list" });
  (config.rules || []).forEach((rule) => createRuleRow(rulesContainer, rule));
  if (!rulesContainer.childElementCount) {
    createRuleRow(rulesContainer);
  }
  const addRuleBtn = createButton("ルールを追加", { variant: "secondary" });
  addRuleBtn.addEventListener("click", () => createRuleRow(rulesContainer));

  form.append(rulesContainer, el("div", { className: "inline-actions" }, addRuleBtn));
  form.append(el("div", { className: "inline-actions" }, createButton("設定を保存", { type: "submit" })));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const rules = [];
    rulesContainer.querySelectorAll(".rule-row").forEach((row) => {
      const day = row.querySelector('[data-field="day"]').value;
      const openHour = Number(row.querySelector('[data-field="survey_open_hour"]').value) || 0;
      const closeHour = Number(row.querySelector('[data-field="survey_close_hour"]').value) || 0;
      const notifyChannel = row.querySelector('[data-field="notify_channel_id"]').value.trim();
      const minMembers = Number(row.querySelector('[data-field="min_team_members"]').value) || 3;
      if (!notifyChannel) {
        return;
      }
      rules.push({
        day,
        survey_open_hour: openHour,
        survey_close_hour: closeHour,
        notify_channel_id: notifyChannel,
        min_team_members: minMembers,
      });
    });

    const payload = {
      timezone: timezoneSelect.value,
      manager_role_id: managerRoleInput.value.trim() || null,
      rules,
    };

    toggleLoading(form, true);
    try {
      const data = await state.request("/api/scrims.config.save", payload);
      if (data.config) {
        state.updateSnapshot("scrims", data.config);
      }
      showToast("スクリム設定を保存しました。", "success");
      clear(root);
      await renderScrims({ state, root, showToast });
    } catch (error) {
      showToast(error.message || "保存に失敗しました。", "error");
    } finally {
      toggleLoading(form, false);
    }
  });

  section.append(form);

  const runSection = createSection("手動実行");
  const runForm = el("form");
  const dryRunToggle = el("input", { type: "checkbox" });
  dryRunToggle.checked = true;
  const dryRunField = formField("Dry-run", dryRunToggle, "チェックしたままならリハーサルのみ実行します");
  const resultArea = el("pre", { textContent: "" });
  runForm.append(
    dryRunField,
    el("div", { className: "inline-actions" }, createButton("実行", { type: "submit" })),
    resultArea,
  );

  runForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    toggleLoading(runForm, true);
    try {
      const data = await state.request("/api/scrims.run", { dry_run: dryRunToggle.checked });
      resultArea.textContent = JSON.stringify(data.result, null, 2);
      showToast("スクリム処理を実行しました。", "success");
    } catch (error) {
      showToast(error.message || "実行に失敗しました。", "error");
    } finally {
      toggleLoading(runForm, false);
    }
  });

  runSection.append(runForm);

  root.append(section, runSection);
}
