
// ==========================
// ① OneDrive ログイン設定
// ==========================
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
let currentPlayingId = null;

// HTML 要素
const loginBtn = document.getElementById("loginBtn");
const chooseFolderBtn = document.getElementById("chooseFolderBtn");
const trackList = document.getElementById("trackList");
const currentFolder = document.getElementById("currentFolder");

let folderSongsMap = {};     // フォルダID → 曲配列
let folderNameMap  = {};     // フォルダID → フォルダ名


// ==========================
// ② ページ読み込み時
// ==========================
// ★ redirect 用の処理は iPhone で邪魔なので完全削除
window.addEventListener("load", () => {
  // 何もしない
});


// ==========================
// ③ ログインボタン
// ==========================
loginBtn.onclick = () => {
  login();
};


// ==========================
// ④ ポップアップ方式ログイン
// ==========================
function login() {
  alert("Microsoft のログイン画面に移動します");

  msalInstance.loginPopup(loginRequest)
    .then(result => {
      console.log("ログイン成功", result);

      return msalInstance.acquireTokenSilent({
        scopes: ["Files.Read"],
        account: result.account
      });
    })
    .then(tokenResponse => {
      accessToken = tokenResponse.accessToken;
      console.log("アクセストークン取得", accessToken);

      // UI 更新
      loginBtn.disabled = true;
      chooseFolderBtn.disabled = false;
    })
    .catch(err => {
      console.error("ログインエラー", err);
    });
}

// ==========================
// ④ ログイン後
// ==========================
async function handleLogin(account) {
  msalInstance.setActiveAccount(account);

  const tokenResponse = await msalInstance.acquireTokenSilent({
    ...loginRequest,
    account
  });

  accessToken = tokenResponse.accessToken;

  loginBtn.disabled = true;
  chooseFolderBtn.disabled = false;
}


// ==========================
// ⑤ フォルダ選択ボタン
// ==========================
chooseFolderBtn.onclick = () => {
  showFolderChildren();
};


// ==========================
// ⑥ ルート直下のフォルダ一覧
// ==========================
async function listRootFolders() {
  const res = await fetch(
    "https://graph.microsoft.com/v1.0/me/drive/root/children",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const data = await res.json();
  return data.value.filter(item => item.folder);
}


// ==========================
// ⑦ フォルダ一覧を表示
// ==========================
async function showFolderChildren(folderId, folderName) {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}/children`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const data = await res.json();
  const items = data.value;

  const container = document.getElementById("folderList");
  container.innerHTML = ""; // 前の階層を消す

  // --- 決定ボタン ---
  const decideBtn = document.createElement("button");
  decideBtn.textContent = "このフォルダを使う";
  decideBtn.style.margin = "10px 0";

  decideBtn.onclick = () => {
    // ★ フォルダ名を保存（フォルダID → フォルダ名）
    folderNameMap[folderId] = folderName;

    // ★ 選択したフォルダを保存
    localStorage.setItem("musicFolderId", folderId);

    // ★ 再帰スキャン開始
    loadMusicFromFolder(folderId);

    // UI を閉じる
    container.innerHTML = "";
  };

  container.appendChild(decideBtn);

  // --- フォルダ一覧 ---
  items.forEach(item => {
    if (item.folder) {
      const btn = document.createElement("button");
      btn.textContent = "📁 " + item.name;
      btn.style.display = "block";
      btn.style.margin = "6px 0";

      btn.onclick = () => {
        // ★ フォルダ名も渡す
        showFolderChildren(item.id, item.name);
      };

      container.appendChild(btn);
    }
  });
}


// ==========================
// ⑧ 再帰的に曲を取得
// ==========================
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



// ==========================
// ⑨ 曲を読み込み → 表示 → 再生
// ==========================
async function loadMusicFromFolder(folderId) {
  console.log("選択フォルダID:", folderId);

  // ① 再帰的に曲一覧を取得
  const songs = await getFilesRecursively(folderId);

  // ② downloadUrl を付与
  for (let song of songs) {
    const urlRes = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${song.id}?select=@microsoft.graph.downloadUrl`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await urlRes.json();
    song["@microsoft.graph.downloadUrl"] = data["@microsoft.graph.downloadUrl"];
  }

  // ③ フォルダごとに保存（重複曲は追加しない）
  if (!folderSongsMap[folderId]) {
    folderSongsMap[folderId] = [];
  }

  songs.forEach(song => {
    if (!folderSongsMap[folderId].some(s => s.id === song.id)) {
      folderSongsMap[folderId].push(song);
    }
  });

  // ④ フォルダごとに表示
  renderFolderLists();
}



// ==========================
// ⑩ 曲一覧を表示
// ==========================
function renderSongList(songs) {
  trackList.innerHTML = "";

  songs.forEach(song => {
    const li = document.createElement("li");
    li.textContent = song.name;
    li.style.cursor = "pointer";

    li.onclick = () => {
      playSong(song);
    };

    trackList.appendChild(li);
  });
}

function renderFolderLists() {
  const container = document.getElementById("trackList");
  container.innerHTML = "";

  for (const folderId in folderSongsMap) {
    const songs = folderSongsMap[folderId];

    // ★ フォルダ名を取得（なければID）
    const folderName = folderNameMap[folderId] || folderId;

    // --- フォルダタイトル ---
    const title = document.createElement("h3");
    title.textContent = `📁 ${folderName}`;
    title.style.marginTop = "20px";
    title.style.color = "#333";
    container.appendChild(title);

    // --- 曲リスト ---
    songs.forEach(song => {
      const li = document.createElement("div");
      li.textContent = song.name;
      li.style.cursor = "pointer";
      li.style.padding = "4px 0";

      if (song.id === currentPlayingId) {
        li.style.background = "#d0f0ff";
      }

      li.onclick = () => {
        playSong(song);
        currentPlayingId = song.id;
        renderFolderLists();
      };

      container.appendChild(li);
    });
  }
}



// ==========================
// ⑪ 再生
// ==========================
function playSong(song) {
  if (currentAudio) {
    currentAudio.pause();
  }

  currentAudio = new Audio(song["@microsoft.graph.downloadUrl"]);
  currentAudio.play();

  document.getElementById("nowPlaying").textContent =
    `▶ 再生中: ${song.name}`;
}
