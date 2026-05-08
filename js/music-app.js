
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
let currentPlayingId = null;
let currentFolderId = null;
let currentFolderParentName = null;


// HTML 要素
const loginBtn = document.getElementById("loginBtn");
const chooseFolderBtn = document.getElementById("chooseFolderBtn");
const trackList = document.getElementById("trackList");

let folderSongsMap = {};     // フォルダID → 曲配列
let folderNameMap  = {};     // フォルダID → フォルダ名

/* ==========================
   追加（選曲リスト & 再生管理）
========================== */
let selectedSongs = [];
let audio = new Audio();  // mini-player と同期
let currentIndex = 0;     // 再生中の曲番号
let isRepeating = false;  // 1曲リピート


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

      // ログイン後すぐフォルダ選択を開く
      const folders = await listRootFolders();

      const container = document.getElementById("folderList");
      container.innerHTML = "";

      folders.forEach(item => {
        showFolderChildren(item.id, item.name);
        console.log("item=",item);
      });
    })
    .catch(err => console.error("ログインエラー", err));
}



/* ==========================
   ⑤ ルート直下のフォルダ一覧取得
========================== */
async function listRootFolders() {
  const res = await fetch(
    "https://graph.microsoft.com/v1.0/me/drive/root/children",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const data = await res.json();
  return data.value.filter(item => item.folder);
}

/* ==========================
   OneDrive 子フォルダ表示
========================== */
async function showFolderChildren(folderId, parentName) {
  currentFolderId = folderId;
  currentFolderParentName = parentName || "Unknown Artist";

  const url = `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}/children`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json();

  const container = document.getElementById("folderList");
  container.innerHTML = "";

  data.value.forEach(item => {
    const div = document.createElement("div");
    div.className = "folder-item";
    div.textContent = item.name;

    if (item.folder) {
      div.onclick = () => showFolderChildren(item.id, item.name);
    } else if (item.name.match(/\.(mp3|wav|m4a)$/i)) {
      div.onclick = () => addSingleSong(item);
    }

    container.appendChild(div);
  });
}

/* ==========================
   ⑦ フォルダカード（CSS対応）
========================== */
function renderSongCard(container, item) {
  const card = document.createElement("div");
  card.className = "song-item";

  // カバー画像
  const cover = document.createElement("img");
  cover.className = "song-cover";
  cover.src = "assets/images/music-note.png";

  // 情報
  const info = document.createElement("div");
  info.className = "song-info";

  const title = document.createElement("div");
  title.className = "song-title";
  title.textContent = item.name;

  const artist = document.createElement("div");
  artist.className = "song-artist";
  artist.textContent = ""; // ← 後でフォルダ階層から入れる

  info.appendChild(title);
  info.appendChild(artist);

  // 追加ボタン
  const addBtn = document.createElement("button");
  addBtn.className = "save-btn";
  addBtn.textContent = "追加";

  addBtn.onclick = (e) => {
    e.stopPropagation(); // カードクリックと区別
    addSingleSong(item);
  };

  // カード構築
  card.appendChild(cover);
  card.appendChild(info);
  card.appendChild(addBtn);

  container.appendChild(card);
}




/* ==========================
   ⑨ 曲を読み込み → 保存 → 表示
========================== */
async function loadMusicFromFolder(folderId) {
  // ① フォルダ内の曲を再帰的に取得
  const songs = await getFilesRecursively(folderId);

  // ② アルバム名（このフォルダ名）
  const albumName = folderNameMap[folderId] || "Unknown Album";

  // ③ アーティスト名（親フォルダ名を使う）
  // showFolderChildren() で folderNameMap に保存している前提
  let artistName = "Unknown Artist";

  // 親フォルダ名を取得（folderNameMap に保存されている）
  if (folderNameMap["parent"]) {
    artistName = folderNameMap["parent"];
  }

  // ④ 選曲リストをクリア（1つだけ保持）
  selectedSongs = [];

  // ⑤ 曲を selectedSongs に追加（folderId を保持）
  for (const song of songs) {
    const urlRes = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${song.id}?select=@microsoft.graph.downloadUrl`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await urlRes.json();

    selectedSongs.push({
      id: song.id,
      folderId: folderId,          // ★ フォルダID方式を保持
      name: song.name,
      url: data["@microsoft.graph.downloadUrl"],
      artist: artistName,
      album: albumName
    });
  }

  // ⑥ 選曲リストを表示
  renderSelectedList();
}




/* ==========================
   ⑩再生リスト表示
========================== */
function renderSelectedList() {
  const container = document.getElementById("trackList");
  container.innerHTML = "";

  selectedSongs.forEach((song, index) => {
    const item = document.createElement("div");
    item.className = "song-item";

    // カバー画像
    const cover = document.createElement("img");
    cover.className = "song-cover";
    cover.src = "assets/images/music-note.png";

    // 曲情報
    const info = document.createElement("div");
    info.className = "song-info";

    const titleEl = document.createElement("div");
    titleEl.className = "song-title";
    titleEl.textContent = song.name;

    const artistEl = document.createElement("div");
    artistEl.className = "song-artist";
    artistEl.textContent = `${song.artist} / ${song.album}`;

    info.appendChild(titleEl);
    info.appendChild(artistEl);

    // ▶ 再生ボタン
    const playBtn = document.createElement("button");
    playBtn.className = "save-btn";
    playBtn.textContent = "▶";
    playBtn.onclick = (e) => {
      e.stopPropagation();
      playFromList(index);
    };

    // 🔀 シャッフルボタン
    const shuffleBtn = document.createElement("button");
    shuffleBtn.className = "save-btn";
    shuffleBtn.textContent = "🔀";
    shuffleBtn.onclick = (e) => {
      e.stopPropagation();
      shufflePlay();
    };

    // カード構築
    item.appendChild(cover);
    item.appendChild(info);
    item.appendChild(playBtn);
    item.appendChild(shuffleBtn);

    container.appendChild(item);
  });
}


/* ==========================
   downloadUrl を毎回取得
========================== */
async function getDownloadUrl(id) {
  const urlRes = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${id}?select=@microsoft.graph.downloadUrl`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await urlRes.json();
  return data["@microsoft.graph.downloadUrl"];
}


/* ==========================
   アルバム読み込み
========================== */
async function loadMusicFromFolder(folderId, albumName) {
  const songs = await getFilesRecursively(folderId);

  const artistName = currentFolderParentName || "Unknown Artist";

  selectedSongs = [];

  for (const song of songs) {
    selectedSongs.push({
      id: song.id,
      folderId: folderId,
      name: song.name,
      artist: artistName,
      album: albumName
    });
  }

  renderSelectedList();
}


/* ==========================
   単曲追加
========================== */
async function addSingleSong(item) {
  const albumName = item.parentReference?.name || "Unknown Album";
  const artistName = currentFolderParentName || "Unknown Artist";

  selectedSongs.push({
    id: item.id,
    folderId: currentFolderId,
    name: item.name,
    artist: artistName,
    album: albumName
  });

  renderSelectedList();
}


/* ==========================
   再生リスト表示
========================== */
function renderSelectedList() {
  const container = document.getElementById("trackList");
  container.innerHTML = "";

  selectedSongs.forEach((song, index) => {
    const item = document.createElement("div");
    item.className = "song-item";

    const cover = document.createElement("img");
    cover.className = "song-cover";
    cover.src = "assets/images/music-note.png";

    const info = document.createElement("div");
    info.className = "song-info";

    const titleEl = document.createElement("div");
    titleEl.className = "song-title";
    titleEl.textContent = song.name;

    const artistEl = document.createElement("div");
    artistEl.className = "song-artist";
    artistEl.textContent = `${song.artist} / ${song.album}`;

    info.appendChild(titleEl);
    info.appendChild(artistEl);

    const playBtn = document.createElement("button");
    playBtn.className = "save-btn";
    playBtn.textContent = "▶";
    playBtn.onclick = (e) => {
      e.stopPropagation();
      playFromList(index);
    };

    const shuffleBtn = document.createElement("button");
    shuffleBtn.className = "save-btn";
    shuffleBtn.textContent = "🔀";
    shuffleBtn.onclick = (e) => {
      e.stopPropagation();
      shufflePlay();
    };

    item.appendChild(cover);
    item.appendChild(info);
    item.appendChild(playBtn);
    item.appendChild(shuffleBtn);

    container.appendChild(item);
  });
}
/* ==========================
   ID で再生する
========================== */
async function playFromList(index) {
  currentIndex = index;
  const song = selectedSongs[index];

  const url = await getDownloadUrl(song.id);

  if (!url) {
    alert("URL取得失敗: " + song.name);
    return;
  }

  audio.src = url;
  audio.play();

  updateMiniPlayer(song);

  document.getElementById("nowPlaying").textContent =
    `▶ 再生中: ${song.name}`;
}

/* ==========================
   ミニプレイヤー更新
========================== */
function updateMiniPlayer(song) {
  document.getElementById("mini-cover").src = "assets/images/music-note.png";
  document.getElementById("mini-title").textContent = song.name;
  document.getElementById("mini-artist").textContent = `${song.artist} / ${song.album}`;
  document.getElementById("mini-playbtn").textContent = "⏸";
}

/* ==========================
   曲終了時の処理
========================== */
audio.onended = () => {
  if (isRepeating) {
    playFromList(currentIndex);
  } else {
    currentIndex++;
    if (currentIndex < selectedSongs.length) {
      playFromList(currentIndex);
    }
  }
};


/* ==========================
   シャッフル再生
========================== */
function shufflePlay() {
  const index = Math.floor(Math.random() * selectedSongs.length);
  playFromList(index);
}