
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
window.addEventListener("load", async () => {
 /* msalInstance.handleRedirectPromise().then(async (response) => {

    if (response) {
      await handleLogin(response.account);
    } else {
      const accounts = msalInstance.getAllAccounts();
      if (accounts.length > 0) {
        await handleLogin(accounts[0]);
      }
    }

    // 保存済みフォルダIDがあれば自動読み込み
    if (accessToken) {
      const savedFolderId = localStorage.getItem("musicFolderId");
      if (savedFolderId) {
        currentFolder.textContent = `保存済みフォルダID: ${savedFolderId}`;
        await loadMusicFromFolder(savedFolderId);
      }
    }
  });*/
});


// ==========================
// ③ ログイン
// ==========================
loginBtn.onclick = () => {
  login();
};

// ==========================
// ログイン処理
// ==========================
function login() {
  alert("Microsoft のログイン画面に移動します");
  msalInstance.loginPopup({
    scopes: ["Files.Read"]
  }).then(result => {
    console.log("ログイン成功", result);
    return msalInstance.acquireTokenSilent({
      scopes: ["Files.Read"],
      account: result.account
    });
  }).then(tokenResponse => {
    accessToken = tokenResponse.accessToken;
    console.log("アクセストークン取得", accessToken);
    loginBtn.disabled = true;
    chooseFolderBtn.disabled = false;
  }).catch(err => {
    console.error(err);
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
  showFolderList();
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
async function showFolderChildren(folderId) {
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
  decideBtn.textContent = "曲を探すフォルダ決定";
  decideBtn.style.margin = "10px 0";
  decideBtn.onclick = () => {
    localStorage.setItem("musicFolderId", folderId);
    loadMusicFromFolder(folderId);  // ← 再帰スキャン開始
    container.innerHTML = "";       // UI を消す
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
        showFolderChildren(item.id);  // ← 下の階層へ移動
      };

      container.appendChild(btn);
    }
  });
}
// ==========================
// ⑧ 決定ボタンを押下する
// ==========================
decideBtn.onclick = () => {
  // フォルダ名も一緒に保存しておく
  folderNameMap[folderId] = currentFolderName; // ← ここは後で説明する

  localStorage.setItem("musicFolderId", folderId);
  loadMusicFromFolder(folderId);
  container.innerHTML = "";
};

// ==========================
// ⑧ 決定ボタン押下時の動作
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

  // ③ 曲一覧を表示
  renderSongList(songs);

  // ④ 最初の曲を再生
  if (songs.length > 0) {
    playSong(songs[0]);
  }
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

let folderSongsMap = {};  
// 例： folderSongsMap[folderId] = [song1, song2, ...]
