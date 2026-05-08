
/* ==========================
   ① OneDrive ログイン設定
========================== */
const msalConfig = {
  auth: {
    clientId: "b828c8e4-f06f-4c6e-b0fe-b6401516a1e1",
    redirectUri: "https://ya-masa.github.io/music-app/"
  }
};

const loginRequest = { scopes: ["Files.Read"] };
const msalInstance = new msal.PublicClientApplication(msalConfig);

let accessToken = null;
let currentAudio = null;

// HTML 要素
const loginBtn = document.getElementById("loginBtn");
const chooseFolderBtn = document.getElementById("chooseFolderBtn");
const trackList = document.getElementById("trackList");
const folderList = document.getElementById("folderList");

// 保存用
let folderSongsMap = {};   // フォルダID → 曲配列
let folderNameMap  = {};   // フォルダID → フォルダ名


/* ==========================
   ② ページ読み込み時：保存フォルダを復元
========================== */
window.addEventListener("load", async () => {
  const saved = JSON.parse(localStorage.getItem("savedFolders") || "[]");
  const savedNames = JSON.parse(localStorage.getItem("folderNameMap") || "{}");

  folderNameMap = savedNames;

  for (const folderId of saved) {
    await loadMusicFromFolder(folderId);
  }
});


/* ==========================
   ③ ログイン
========================== */
loginBtn.onclick = () => login();

function login() {
  alert("Microsoft のログイン画面に移動します");

  msalInstance.loginPopup(loginRequest)
    .then(result => {
      return msalInstance.acquireTokenSilent({
        scopes: ["Files.Read"],
        account: result.account
      });
    })
    .then(tokenResponse => {
      accessToken = tokenResponse.accessToken;

      loginBtn.disabled = true;
      chooseFolderBtn.disabled = false;

      chooseFolderBtn.click();
    })
    .catch(err => console.error("ログインエラー", err));
}


/* ==========================
   ④ ルートフォルダ一覧
========================== */
chooseFolderBtn.onclick = async () => {
  const folders = await listRootFolders();
  folderList.innerHTML = "";

  folders.forEach(item => {
    renderFolderCard(folderList, item.id, item.name);
  });
};

async function listRootFolders() {
  const res = await fetch(
    "https://graph.microsoft.com/v1.0/me/drive/root/children",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const data = await res.json();
  return data.value.filter(item => item.folder);
}


/* ==========================
   ⑤ 下の階層のフォルダ表示
========================== */
async function showFolderChildren(folderId, folderName) {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}/children`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  const items = data.value;

  folderList.innerHTML = "";

  // ★ 決定ボタン
  const decideBtn = document.createElement("button");
  decideBtn.textContent = folderName&"を使う";
  decideBtn.style.margin = "10px 0";
  decideBtn.onclick = () => {
    folderNameMap[folderId] = folderName;
    loadMusicFromFolder(folderId);
    folderList.innerHTML = "";
  };
  folderList.appendChild(decideBtn);

  // ★ 子フォルダだけ表示（曲は表示しない）
  items.forEach(item => {
    if (item.folder) {
      renderFolderCard(folderList, item.id, item.name);
    }
  });
}


/* ==========================
   ⑥ フォルダカード（CSS対応）
========================== */
function renderFolderCard(container, folderId, folderName) {
  const card = document.createElement("div");
  card.className = "song-item";

  const icon = document.createElement("div");
  icon.className = "song-cover";
  icon.style.background = "#ccc";
  icon.textContent = "📁";
  icon.style.display = "flex";
  icon.style.alignItems = "center";
  icon.style.justifyContent = "center";

  const info = document.createElement("div");
  info.className = "song-info";

  const name = document.createElement("div");
  name.className = "song-title";
  name.textContent = folderName;

  info.appendChild(name);
  card.appendChild(icon);
  card.appendChild(info);

  card.onclick = () => showFolderChildren(folderId, folderName);

  container.appendChild(card);
}


/* ==========================
   ⑦ 再帰的に曲を取得
========================== */
async function getFilesRecursively(folderId) {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}/children`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const data = await res.json();
  let files = [];

  for (let item of data.value) {
    if (item.folder) {
      const subFiles = await getFilesRecursively(item.id);
      files = files.concat(subFiles);
    } else if (item.file && item.file.mimeType.startsWith("audio/")) {
      files.push(item);
    }
  }

  return files;
}


/* ==========================
   ⑧ 曲を読み込み → 保存 → 表示
========================== */
async function loadMusicFromFolder(folderId) {
  const songs = await getFilesRecursively(folderId);

  folderSongsMap[folderId] = songs;

  // 保存
  localStorage.setItem("savedFolders", JSON.stringify(Object.keys(folderSongsMap)));
  localStorage.setItem("folderNameMap", JSON.stringify(folderNameMap));

  // 表示
  renderDownloadedLists();
}


/* ==========================
   ⑨ ダウンロード済みリスト表示（カード型）
========================== */
function renderDownloadedLists() {
  trackList.innerHTML = "";

  for (const folderId in folderSongsMap) {
    const songs = folderSongsMap[folderId];
    const folderName = folderNameMap[folderId] || folderId;

    // フォルダタイトル
    const titleRow = document.createElement("div");
    titleRow.style.display = "flex";
    titleRow.style.alignItems = "center";
    titleRow.style.gap = "10px";

    const title = document.createElement("h3");
    title.textContent = `📁 ${folderName}`;

    // ★ フォルダ削除ボタン
    const delBtn = document.createElement("button");
    delBtn.textContent = "削除";
    delBtn.style.background = "#ffe0e0";
    delBtn.style.border = "none";
    delBtn.style.padding = "6px 10px";
    delBtn.style.borderRadius = "8px";
    delBtn.style.cursor = "pointer";

    delBtn.onclick = () => {
      delete folderSongsMap[folderId];
      delete folderNameMap[folderId];

      localStorage.setItem("savedFolders", JSON.stringify(Object.keys(folderSongsMap)));
      localStorage.setItem("folderNameMap", JSON.stringify(folderNameMap));

      renderDownloadedLists();
    };

    titleRow.appendChild(title);
    titleRow.appendChild(delBtn);
    trackList.appendChild(titleRow);

    // 曲カード
    songs.forEach(song => {
      const item = document.createElement("div");
      item.className = "song-item";

      const cover = document.createElement("img");
      cover.className = "song-cover";
      cover.src = "images/music-note.png";

      const info = document.createElement("div");
      info.className = "song-info";

      const titleEl = document.createElement("div");
      titleEl.className = "song-title";
      titleEl.textContent = song.name;

      const artistEl = document.createElement("div");
      artistEl.className = "song-artist";
      artistEl.textContent = "Unknown Artist";

      info.appendChild(titleEl);
      info.appendChild(artistEl);

      item.appendChild(cover);
      item.appendChild(info);

      item.onclick = () => playSong(song);

      trackList.appendChild(item);
    });
  }
}


/* ==========================
   ⑩ 再生（URLをその場で取得）
========================== */
async function playSong(song) {
  if (currentAudio) currentAudio.pause();

  const urlRes = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${song.id}?select=@microsoft.graph.downloadUrl`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const data = await urlRes.json();
  const url = data["@microsoft.graph.downloadUrl"];

  if (!url) {
    alert("URL取得失敗: " + song.name);
    return;
  }

  currentAudio = new Audio(url);
  currentAudio.play();

  document.getElementById("nowPlaying").textContent =
    `▶ 再生中: ${song.name}`;
}

