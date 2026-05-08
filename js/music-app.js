
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
      listRootFolders();
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
chooseFolderBtn.onclick = async () => {
  const folders = await listRootFolders();

  const container = document.getElementById("folderList");
  container.innerHTML = "";

  folders.forEach(item => {
    const btn = document.createElement("button");
    btn.textContent = "📁 " + item.name;
    btn.style.display = "block";
    btn.style.margin = "6px 0";

    btn.onclick = () => {
      showFolderChildren(item.id, item.name);
    };

    container.appendChild(btn);
  });
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
function showFolderChildren(folderId, folderName) {
  const container = document.getElementById("folderList");
  container.innerHTML = "";

  // 決定ボタン
  const decideBtn = document.createElement("button");
  decideBtn.textContent = "このフォルダを使う";
  decideBtn.style.margin = "10px 0";
  decideBtn.onclick = () => {
    folderNameMap[folderId] = folderName;
    localStorage.setItem("musicFolderId", folderId);
    loadMusicFromFolder(folderId);
    container.innerHTML = "";
  };
  container.appendChild(decideBtn);

  // フォルダ一覧
  items.forEach(item => {
    if (item.folder) {
      const card = document.createElement("div");
      card.className = "song-item";

      const icon = document.createElement("div");
      icon.className = "song-cover";
      icon.style.background = "#ccc";
      icon.style.display = "flex";
      icon.style.alignItems = "center";
      icon.style.justifyContent = "center";
      icon.textContent = "📁";

      const info = document.createElement("div");
      info.className = "song-info";

      const name = document.createElement("div");
      name.className = "song-title";
      name.textContent = item.name;

      info.appendChild(name);
      card.appendChild(icon);
      card.appendChild(info);

      card.onclick = () => {
        showFolderChildren(item.id, item.name);
      };

      container.appendChild(card);
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
  const songs = await getFilesRecursively(folderId);

  if (!folderSongsMap[folderId]) {
    folderSongsMap[folderId] = [];
  }

  songs.forEach(song => {
    if (!folderSongsMap[folderId].some(s => s.id === song.id)) {
      folderSongsMap[folderId].push(song);
    }
  });

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
    const folderName = folderNameMap[folderId] || folderId;

    // --- フォルダタイトル ---
    const title = document.createElement("h3");
    title.textContent = `📁 ${folderName}`;
    title.style.margin = "16px 0 8px";
    container.appendChild(title);

    // --- 曲カード一覧 ---
    songs.forEach(song => {
      const item = document.createElement("div");
      item.className = "song-item";

      // カバー画像（今は仮）
      const cover = document.createElement("img");
      cover.className = "song-cover";
      cover.src = "img/default-cover.png"; // なければ仮画像

      // 曲情報
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

      // カードに追加
      item.appendChild(cover);
      item.appendChild(info);

      // 再生
      item.onclick = () => {
        playSong(song);
        currentPlayingId = song.id;
        renderFolderLists();
      };

      container.appendChild(item);
    });
  }
}





// ==========================
// ⑪ 再生
// ==========================
async function playSong(song) {
  if (currentAudio) {
    currentAudio.pause();
  }

  // ① 再生用URLを取得（毎回新鮮なURL）
  const urlRes = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${song.id}?select=@microsoft.graph.downloadUrl`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const data = await urlRes.json();
  const url = data["@microsoft.graph.downloadUrl"];

  console.log("再生URL:", url);

  if (!url) {
    alert("この曲のURLが取得できませんでした: " + song.name);
    return;
  }

  // ② 再生
  currentAudio = new Audio(url);
  currentAudio.play();

  document.getElementById("nowPlaying").textContent =
    `▶ 再生中: ${song.name}`;
}
