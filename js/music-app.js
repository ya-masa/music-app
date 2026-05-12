
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
const trackList = document.getElementById("trackList");
const slider = document.getElementById("mini-slider");
const current = document.getElementById("mini-current");
const duration = document.getElementById("mini-duration");

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
//クリック時のアクション↓
loginBtn.onclick = () => login();

//ログイン時の呼び出し関数
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

    // ③ フォルダ一覧取得（await OK）
    const folders = await listRootFolders();

    const container = document.getElementById("folderList");
    container.innerHTML = "";

    // ④ フォルダ一覧を表示
    folders.forEach(folder => {
      renderFolderCard(container, folder);
    });

  } catch (err) {
    console.error("ログインエラー", err);
    relogin();
  }
}
/* ==========================
   ③ トークン切れの際の処理
========================== */
function relogin(){
  loginBtn.disabled = false;
}
async function fetchWithAuth(url,options = {}){
  let response = await fetch(url,options);

  if (response.status === 401){
      console.log("トークン切れ → 再ログインします");
      relogin();
      alert("再ログインしてください");
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
  backBtn.className = "btn";
  backBtn.onclick = async () => {
      // ③ フォルダ一覧取得（await OK）
      const folders = await listRootFolders();

      const container = document.getElementById("folderList");
      container.innerHTML = "";

      // ④ フォルダ一覧を表示
      folders.forEach(folder => {
        renderFolderCard(container, folder);
      });
  };
  container.appendChild(backBtn);

  /* --------------------------
     ★ このフォルダに決定ボタン
  -------------------------- */
  const decideBtn = document.createElement("button");
  decideBtn.textContent = "🎵 このフォルダに決定";
  decideBtn.className = "btn";
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
  const folderCard = document.createElement("div");
  folderCard.className = "song-item";

  const cover = document.createElement("img");
  cover.className = "song-cover";
  cover.src = "assets/images/folder.png";

  const info = document.createElement("div");
  info.className = "song-info";

  const title = document.createElement("div");
  title.className = "song-title";
  title.textContent = item.name;

  info.appendChild(title);

  folderCard.appendChild(cover);
  folderCard.appendChild(info);

  folderCard.onclick = () => showFolderChildren(item.id, item.name);

  container.appendChild(folderCard);
}

/* ==========================
   ⑦ 曲カード（CSS対応）
========================== */
function renderSongCard(container, song) {
  const musicCard = document.createElement("div");
  musicCard.className = "song-item";

  const cover = document.createElement("img");
  cover.className = "song-cover";
  cover.src = "assets/images/music-note.png";

  const info = document.createElement("div");
  info.className = "song-info";

  const title = document.createElement("div");
  title.className = "song-title";
  title.textContent = song.name;

  const artist = document.createElement("div");
  artist.className = "song-artist";
  artist.textContent = getArtistNameFromItem(song) || "";

  info.appendChild(title);
  info.appendChild(artist);

  musicCard.onclick = (e) => {
    e.stopPropagation();
    addSingleSong(song);
  };

  musicCard.appendChild(cover);
  musicCard.appendChild(info);

  container.appendChild(musicCard);
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
async function addSingleSong(song) {
  const albumName = song.parentReference?.name || "Unknown Album";
  const artistName = getArtistNameFromItem(song) || "Unknown Artist";

  selectedSongs.push({
    id: song.id,
    folderId: currentFolderId,
    name: song.name,
    artist: artistName,
    album: albumName
  });

  renderSelectedList();
}
/* ==========================
   歌手名を２個上のフォルダ名から取得
========================== */
function getArtistNameFromItem(item) {
  const path = item.parentReference?.path; 
  if (!path) return "Unknown Artist";

  const parts = path.split("/");
  // 最後の要素は "アルバム名"
  // その1つ前が "アーティスト名"
  return parts[parts.length - 2] || "Unknown Artist";
}


/* ==========================
   再生リスト表示
========================== */
function renderSelectedList() {
  const container = document.getElementById("trackList");
  container.innerHTML = "";

  selectedSongs.forEach((song, index) => {

// ラッパー（スワイプ対象）
    const row = document.createElement("div");
    row.className = "song-item";

    // 曲情報
    const cover = document.createElement("img");
    cover.className = "song-cover";
    cover.src = "./assets/images/music-note.png";

    const info = document.createElement("div");
    info.className = "song-info";

    const title = document.createElement("div");
    title.className = "song-title";
    title.textContent = song.name;

    const artist = document.createElement("div");
    artist.className = "song-artist";
    artist.textContent = `${song.artist} / ${song.album}`;

    info.appendChild(title);
    info.appendChild(artist);

    // ==========================
    // 削除ボタン
    // ==========================
    const del = document.createElement("div");
    del.className = "song-delete-swipe";
    del.textContent = "🗑️";

    del.onclick = (e) => {
      e.stopPropagation();

      selectedSongs.splice(index, 1);

      if (currentIndex >= selectedSongs.length) {
        currentIndex = selectedSongs.length - 1;
      }
      if (currentIndex < 0) currentIndex = 0;

      renderSelectedList();
    };

    // ==========================
    // 再生（onclick は1つだけ）
    // ==========================
    row.onclick = () => {
      if (swiped) return;  // スワイプ中は再生しない
      playFromList(index); // ← 正しい
    };


    // ==========================
    // スワイプ処理
    // ==========================
    let startX = 0;
    let swiped = false;

    row.addEventListener("touchstart", (e) => {
      e.stopPropagation();
      startX = e.touches[0].clientX;
    });

    row.addEventListener("touchmove", (e) => {
      e.stopPropagation();
      const diff = e.touches[0].clientX - startX;

      if (diff < -20) {
        row.style.transform = "translateX(-80px)";
        del.style.transform = "translateX(0)";
        swiped = true;
      }
      if (diff > 20 && swiped) {
        row.style.transform = "translateX(0)";
        del.style.transform = "translateX(100%)";
        swiped = false;
      }
    });

    row.appendChild(cover);
    row.appendChild(info);
    row.appendChild(del);
    container.appendChild(row);
  });
}


/* ==========================
   ID で再生する
========================== */
function playFromList(index) {
  if (!selectedSongs[index]) return;

  currentIndex = index;
  const song = selectedSongs[currentIndex];

  playSong(song);
}


/* ==========================
   次の曲準備
========================== */
async function prefetchNextSong() {
  const nextIndex = (currentIndex + 1) % selectedSongs.length;
  const nextSong = selectedSongs[nextIndex];

  if (nextSong.prefetched) return;

  // 次の曲の downloadUrl を先に取得
  const urlRes = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${nextSong.id}?select=@microsoft.graph.downloadUrl`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const data = await urlRes.json();
  const url = data["@microsoft.graph.downloadUrl"];

  if (url) {
    // 先読み用にキャッシュしておく
    nextSong.prefetched = true;
    nextSong.cachedUrl = url;

    // 実際に軽く fetch してキャッシュを温める
    fetch(url);
  }else{
    relogin();//再ログイン
  }
}

/* ==========================
   曲再生するところ
========================== */
async function playSong(song) {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
  }

  let url = song.cachedUrl;

  if (!url) {
    const urlRes = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${song.id}?select=@microsoft.graph.downloadUrl`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await urlRes.json();
    url = data["@microsoft.graph.downloadUrl"];
  }

  currentAudio = new Audio(url);

  // 🔥 再生中の曲の timeupdate（プリフェッチ用）
  currentAudio.addEventListener("timeupdate", () => {
    if (currentAudio.duration - currentAudio.currentTime < 15) {
      prefetchNextSong();
    }
  });

  // 🔥 曲が終わったら次の曲へ
  currentAudio.addEventListener("ended", () => {
    playNextSong
  });

  currentAudio.play();
  updateMiniPlayer(song);
}
/* ==========================
   次の曲再生
========================== */
function playNextSong() {
  currentIndex = (currentIndex + 1) % selectedSongs.length;
  const nextSong = selectedSongs[currentIndex];
  playSong(nextSong);
}



/* ==========================
   再生ALLボタン押下時の処理
========================== */
document.getElementById("playAllBtn").onclick = () => {
  if (selectedSongs.length === 0) return;
  currentIndex = 0;
  playSong(selectedSongs[0]);
};

/* ==========================
   シャッフルALLボタン押下時の処理
========================== */
document.getElementById("shuffleAllBtn").onclick = () => {
  if (selectedSongs.length === 0) return;
  currentIndex = Math.floor(Math.random() * selectedSongs.length);
  playSong(selectedSongs[currentIndex]);
};

/* ==========================
   ネクストボタン押下時の処理
========================== */
document.getElementById("miniNext").onclick = () => {
  currentIndex = (currentIndex + 1) % selectedSongs.length;
  playSong(selectedSongs[currentIndex]);
};


/* ==========================
   リピート・リピートoneボタン押下時の処理
========================== */
let repeatMode = "off"; // off / all / one

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

/* ==========================
   プレーヤー表示の更新
========================== */
function updateMiniPlayer(song) {
  document.getElementById("mini-cover").src = "./assets/images/music-note.png";
  document.getElementById("mini-title").textContent = song.name;
  document.getElementById("mini-artist").textContent = `${song.artist} / ${song.album}`;

  const btn = document.getElementById("miniPlay");

  // 初期状態は「再生中」
  btn.textContent = "⏸";
  btn.classList.add("playing");

  btn.onclick = () => {
    if (!currentAudio) return;

    if (currentAudio.paused) {
      // ▶ → 再生
      currentAudio.play();
      btn.textContent = "⏸";
      btn.classList.add("playing");
    } else {
      // ⏸ → 停止
      currentAudio.pause();
      btn.textContent = "▶";
      btn.classList.remove("playing");
    }
  };
}

  /* ==========================
    時間を mm:ss に整形
  ========================== */
  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }
  /* ==========================
    曲の長さがわかったらスライダー最大値を設定
  ========================== */
  audio.addEventListener("loadedmetadata", () => {
    slider.max = audio.duration;
    duration.textContent = formatTime(audio.duration);
  });
  /* ==========================
    再生中にスライダーを動かす
  ========================== */
  audio.addEventListener("timeupdate", () => {
    slider.value = audio.currentTime;
    current.textContent = formatTime(audio.currentTime);
  });
  /* ==========================
    スライダー操作で再生位置を変更
  ========================== */
  slider.addEventListener("input", () => {
    audio.currentTime = slider.value;
  });


