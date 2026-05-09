
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

async function login() {
  alert("Microsoft のログイン画面に移動します");

  try {
    // ① ログイン
    const result = await msalInstance.loginPopup(loginRequest);

    // ② トークン取得
    const tokenResponse = await msalInstance.acquireTokenSilent({
      scopes: ["Files.Read"],
      account: result.account
    });

    accessToken = tokenResponse.accessToken;

    loginBtn.disabled = true;
    chooseFolderBtn.disabled = false;

    // ③ フォルダ一覧取得（await OK）
    const folders = await listRootFolders();

    const container = document.getElementById("folderList");
    container.innerHTML = "";

    // ④ フォルダ一覧を表示
    folders.forEach(folder => {
      const div = document.createElement("div");
      div.textContent = folder.name;
      div.onclick = () => showFolderChildren(folder.id, folder.name);
      container.appendChild(div);
    });

  } catch (err) {
    console.error("ログインエラー", err);
  }
}
/* ==========================
   ③ トークン切れの際の処理
========================== */
async function fetchWithAuth(url,options = {}){
  let response = await fetch(url,options);

  if (response.status === 401){
      console.log("トークン切れ → 再ログインします");
      await loginBtn.click();
      response =await fetch(url,options);//再試行
  }
  return response;
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

  // フォルダだけ返す
  return data.value.filter(item => item.folder);
}

/* ==========================
   OneDrive 子フォルダ表示（修正版）
========================== */
async function showFolderChildren(folderId, parentName) {
  currentFolderId = folderId;
  currentFolderParentName = parentName || "Unknown Artist";

  const url = `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}/children`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json();

  const container = document.getElementById("folderList");
  container.innerHTML = "";

  /* --------------------------
     ★ ルートに戻るボタン
  -------------------------- */
  const backBtn = document.createElement("button");
  backBtn.textContent = "📁 ルートフォルダを開く";
  backBtn.className = "save-btn";
  backBtn.onclick = async () => {
      // ③ フォルダ一覧取得（await OK）
      const folders = await listRootFolders();

      const container = document.getElementById("folderList");
      container.innerHTML = "";

      // ④ フォルダ一覧を表示
      folders.forEach(folder => {
        const div = document.createElement("div");
        div.textContent = folder.name;
        div.onclick = () => showFolderChildren(folder.id, folder.name);
        container.appendChild(div);
      });
  };
  container.appendChild(backBtn);

  /* --------------------------
     ★ このフォルダに決定ボタン
  -------------------------- */
  const decideBtn = document.createElement("button");
  decideBtn.textContent = "🎵 このフォルダに決定";
  decideBtn.className = "save-btn";
  decideBtn.style.marginLeft = "10px";
  decideBtn.onclick = () => {
    getFilesRecursively(folder.id);
  };
  container.appendChild(decideBtn);

  /* --------------------------
     ★ 子フォルダ・曲のカード表示
  -------------------------- */
  data.value.forEach(item => {
    if (item.folder) {
      // フォルダカード
      renderFolderCard(container, item);
    } else if (item.name.match(/\.(mp3|wav|m4a)$/i)) {
      // 曲カード
      renderSongCard(container, item);
    }
  });
}


/* ==========================
   ⑦ フォルダカード（CSS対応）
========================== */
function renderFolderCard(container, item) {
  const card = document.createElement("div");
  card.className = "song-item";

  const cover = document.createElement("img");
  cover.className = "song-cover";
  cover.src = "assets/images/folder.png";

  const info = document.createElement("div");
  info.className = "song-info";

  const title = document.createElement("div");
  title.className = "song-title";
  title.textContent = item.name;

  info.appendChild(title);

  card.appendChild(cover);
  card.appendChild(info);

  card.onclick = () => showFolderChildren(item.id, item.name);

  container.appendChild(card);
}
/* ==========================
   ⑦ 曲カード（CSS対応）
========================== */
function renderSongCard(container, item) {
  const card = document.createElement("div");
  card.className = "song-item";

  const cover = document.createElement("img");
  cover.className = "song-cover";
  cover.src = "assets/images/music-note.png";

  const info = document.createElement("div");
  info.className = "song-info";

  const title = document.createElement("div");
  title.className = "song-title";
  title.textContent = item.name;

  const artist = document.createElement("div");
  artist.className = "song-artist";
  artist.textContent = currentFolderParentName || "";

  info.appendChild(title);
  info.appendChild(artist);

  const addBtn = document.createElement("button");
  addBtn.className = "save-btn";
  addBtn.textContent = "追加";
  addBtn.onclick = (e) => {
    e.stopPropagation();
    addSingleSong(item);
  };

  card.appendChild(cover);
  card.appendChild(info);
  card.appendChild(addBtn);

  container.appendChild(card);
}

/* ==========================
   曲カードをスワイプすると削除ボタンが出てくる
========================== */
songs.forEach((song, index) => {
  const card = document.createElement("div");
  card.className = "song-card";

  const title = document.createElement("div");
  title.className = "song-title";
  title.textContent = song.name;

  const del = document.createElement("div");
  del.className = "song-delete-swipe";
  del.textContent = "🗑️";

  del.onclick = (e) => {
    e.stopPropagation();
    songs.splice(index, 1);
    renderFolderLists();
  };

  card.appendChild(title);
  card.appendChild(del);

  // --- スワイプ処理 ---
  let startX = 0;
  let currentX = 0;
  let swiped = false;

  card.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX;
  });

  card.addEventListener("touchmove", (e) => {
    currentX = e.touches[0].clientX;
    const diff = currentX - startX;

    if (diff < -20) {
      // 左スワイプ
      card.style.transform = "translateX(-80px)";
      del.style.transform = "translateX(0)";
      swiped = true;
    }
    if (diff > 20 && swiped) {
      // 右に戻す
      card.style.transform = "translateX(0)";
      del.style.transform = "translateX(100%)";
      swiped = false;
    }
  });

  // 再生
  card.onclick = () => {
    if (swiped) return; // スワイプ中は再生しない
    playSong(song);
    currentPlayingId = song.id;
    renderFolderLists();
  };

  container.appendChild(card);
});

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
   再帰的に曲を取得
========================== */
async function getFilesRecursively(folderId) {
  const url = `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}/children`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json();

  let songs = [];

  for (const item of data.value) {
    if (item.folder) {
      const sub = await getFilesRecursively(item.id);
      songs = songs.concat(sub);
    } else if (item.name.match(/\.(mp3|wav|m4a)$/i)) {
      songs.push(item);
    }
  }

  return songs;
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

    item.onclick = (e) => {
      e.stopPropagation();
      playFromList(index);
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
    loginBtn.onclick();
    playFromList(index);
    return;
  }

  audio.src = url;
  audio.play();

  updateMiniPlayer(song);
}

/* ==========================
   ミニプレイヤー更新
========================== */
function updateMiniPlayer(song) {
  document.getElementById("mini-cover").src = "assets/images/music-note.png";
  document.getElementById("mini-title").textContent = song.name;
  document.getElementById("mini-artist").textContent = `${song.artist} / ${song.album}`;
  document.getElementById("mini-playbtn").textContent = "⏸";
  document.getElementById("mini-playbtn").classList.add("playing");   // ON → 薄い赤
  document.getElementById("mini-playbtn").onclick = () => {
    if(document.getElementById("mini-playbtn").textContent === "⏸") {
      document.getElementById("mini-playbtn").classList.remove("playing"); 
      document.getElementById("mini-playbtn").textContent = "▶";
    }
  }
}

/* ==========================
   曲終了時の処理プリフェッチ
========================== */
audio.addEventListener("timeupdate", () => {
  if (audio.duration - audio.currentTime < 5) {
    prefetchNextSong();
  }
});

function prefetchNextSong() {
  const nextIndex = (currentIndex + 1) % songs.length;
  const nextSong = songs[nextIndex];

  if (!nextSong.prefetched) {
    fetch(nextSong.url).then(res => {
      nextSong.prefetched = true;
    });
  }
}


/* ==========================
   再生ALLボタン押下時の処理
========================== */
document.getElementById("playAllBtn").onclick = () => {
  if (songs.length === 0) return;
  currentIndex = 0;
  playSong(songs[0]);
};
/* ==========================
   シャッフルALLボタン押下時の処理
========================== */
document.getElementById("shuffleAllBtn").onclick = () => {
  if (songs.length === 0) return;
  currentIndex = Math.floor(Math.random() * songs.length);
  playSong(songs[currentIndex]);
};

/* ==========================
   ネクストボタン押下時の処理
========================== */
document.getElementById("miniNext").onclick = () => {
  currentIndex = (currentIndex + 1) % songs.length;
  playSong(songs[currentIndex]);
};
let repeatMode = "off"; // off / all / one

/* ==========================
   リピート・リピートoneボタン押下時の処理
========================== */
document.getElementById("miniRepeat").onclick = () => {
  if (repeatMode === "off") {
    repeatMode = "all";
    miniRepeat.src = "./assets/icons/repeat.svg";
    miniRepeat.classList.add("playing");   // ON → 薄い赤
  } else if (repeatMode === "all") {
    repeatMode = "one";
    miniRepeat.src = "./assets/icons/repeat-one.svg";
    miniRepeat.classList.add("playing");   // ON → 薄い赤
  } else {
    repeatMode = "off";
    miniRepeat.src = "./assets/icons/repeat.svg"; // グレー版にしてもOK
    miniRepeat.classList.remove("playing"); // OFF → 黒

  }
};

function updateMiniPlayer(song) {
  document.getElementById("mini-cover").src = "./assets/images/music-note.png";
  document.getElementById("mini-title").textContent = song.name;
  document.getElementById("mini-artist").textContent = `${song.artist} / ${song.album}`;

  const btn = document.getElementById("mini-playbtn");

  btn.textContent = "⏸";
  btn.classList.add("playing");   // ON → 薄い赤

  btn.onclick = () => {
    if (btn.textContent === "⏸") {
      btn.classList.remove("playing");
      btn.textContent = "▶";
    } else {
      btn.classList.add("playing");
      btn.textContent = "⏸";
    }
  };
}


