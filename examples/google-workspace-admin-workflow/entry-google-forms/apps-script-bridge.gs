/**
 * Google Forms → n8n Webhook bridge
 * ------------------------------------------------------------------------
 * 在你的 Google Forms 回應試算表中部署這段 Apps Script，
 * 讓表單送出時把資料 POST 到 n8n 的 Webhook，
 * 由 n8n core sub-workflow 完成所有自動化。
 *
 * 部署步驟：
 *   1. 開啟「公文專案啟動表_表單回應」試算表 → Extensions → Apps Script
 *   2. 把整份檔案內容貼進 `Code.gs`，並把 BRIDGE_CONFIG 填好。
 *   3. 執行一次 `installBridgeTrigger`（會要求授權）。
 *   4. 對「專案階段日期新增表_表單回應」做同樣步驟，但把
 *      `BRIDGE_CONFIG.flow` 改成 'milestone'。
 *
 * 安全性：
 *   - 預設僅在固定 webhook 路徑用 shared TOKEN 驗證。
 *   - 建議搭配 n8n 端的 Basic Auth 或 IP allowlist 進階保護。
 */

const BRIDGE_CONFIG = {
  flow: 'starter',                                        // 'starter' 或 'milestone'
  webhookUrl: 'https://n8n.example.com/webhook/gw-admin-project-starter',
  token: 'CHANGE_ME_SHARED_SECRET',                       // 對應 n8n entry workflow 內的驗證字串
  timezone: 'Asia/Taipei'
};

function installBridgeTrigger() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('請從表單回應試算表開啟並執行此函式。');

  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'onFormSubmitBridge') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('onFormSubmitBridge')
    .forSpreadsheet(ss)
    .onFormSubmit()
    .create();

  Logger.log('✅ Bridge installed for: ' + ss.getName());
  Logger.log('   POST target: ' + BRIDGE_CONFIG.webhookUrl);
}

function onFormSubmitBridge(e) {
  if (!e || !e.namedValues) {
    Logger.log('❌ 沒有取得表單回應資料，請確認觸發器類型為「試算表：提交表單時」。');
    return;
  }

  const data = {};
  Object.keys(e.namedValues).forEach(function(key) {
    const value = e.namedValues[key];
    data[key] = Array.isArray(value) ? value.join(', ').trim() : String(value || '').trim();
  });

  let submitterEmail = '';
  try {
    submitterEmail = Session.getActiveUser().getEmail() || '';
  } catch (err) {
    Logger.log('無法取得送出者 Email：' + err.message);
  }
  // Apps Script's form-collected email shows up under 「電子郵件地址」 or 「Email Address」
  data['建立者Email'] = submitterEmail || data['電子郵件地址'] || data['Email Address'] || '';

  const payload = {
    token: BRIDGE_CONFIG.token,
    flow: BRIDGE_CONFIG.flow,
    formName: e.range ? e.range.getSheet().getParent().getName() : '',
    submittedAt: Utilities.formatDate(new Date(), BRIDGE_CONFIG.timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    submitterEmail: submitterEmail,
    data: data
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
    followRedirects: true
  };

  try {
    const response = UrlFetchApp.fetch(BRIDGE_CONFIG.webhookUrl, options);
    const status = response.getResponseCode();
    const body = response.getContentText();
    Logger.log('Webhook → HTTP ' + status);
    Logger.log(body);
    if (status < 200 || status >= 300) {
      throw new Error('Webhook returned non-2xx status: ' + status);
    }
  } catch (err) {
    Logger.log('❌ Webhook 呼叫失敗：' + err.message);
    // Optional: email admin on failure
    try {
      MailApp.sendEmail('admin@example.com', '【bridge 失敗】' + BRIDGE_CONFIG.flow,
        '錯誤訊息：' + err.message + '\n\nPayload:\n' + JSON.stringify(payload, null, 2));
    } catch (mailErr) {
      Logger.log('連通知信都失敗：' + mailErr.message);
    }
  }
}

/**
 * Optional helpers ---------------------------------------------------------
 */

function pingWebhook() {
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ token: BRIDGE_CONFIG.token, flow: BRIDGE_CONFIG.flow, data: { ping: true } }),
    muteHttpExceptions: true
  };
  const response = UrlFetchApp.fetch(BRIDGE_CONFIG.webhookUrl, options);
  Logger.log('HTTP ' + response.getResponseCode() + '\n' + response.getContentText());
}
