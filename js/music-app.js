
// ==========================
// ① OneDrive ログイン設定
// ==========================
const msalConfig = {
  auth: {
    clientId: "b828c8e4-f06f-4c6e-b0fe-b6401516a1e1",
    authority: "https://login.microsoftonline.com/common",
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


// ==========================
// ② ページ読み込み時
// ==========================
window.addEventListener("load", async () => {
  msalInstance.handleRedirectPromise().then(async (response) => {

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
  });
});


// ==========================
// ③ ログイン
// ==========================
loginBtn.onclick = () => {
  msalInstance.loginRedirect(loginRequest);
};


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
async function showFolderList() {
  const folders = await listRootFolders();
  const container = document.getElementById("folderList");
  container.innerHTML = "";

  folders.forEach(folder => {
    const btn = document.createElement("button");
    btn.textContent = folder.name;
    btn.style.display = "block";
    btn.style.margin = "8px 0";

    btn.onclick = () => {
      localStorage.setItem("musicFolderId", folder.id);
      currentFolder.textContent = `選択中フォルダ: ${folder.name}`;
      loadMusicFromFolder(folder.id);
    };

    container.appendChild(btn);
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

  for (let song of songs) {
    const urlRes = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${song.id}?select=@microsoft.graph.downloadUrl`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const data = await urlRes.json();
    song["@microsoft.graph.downloadUrl"] = data["@microsoft.graph.downloadUrl"];
  }

  renderSongList(songs);

  if (songs.length > 0) {
    playSong(songs[0]);
  }
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

