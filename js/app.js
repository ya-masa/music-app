// ==========================
// ① OneDrive ログイン設定
// ==========================
const msalConfig = {
  auth: {
    clientId: "b828c8e4-f06f-4c6e-b0fe-b6401516a1e1",
    redirectUri: "https://ya-masa.github.io/music-app/"
  }
};

const msalInstance = new msal.PublicClientApplication(msalConfig);
let accessToken = null;

// ==========================
// 共通プレイヤー用の変数・要素
// ==========================
let audio = new Audio();
let isPlaying = false;
let isRepeat = false;

// メインプレイヤー要素（ID は HTML に合わせてね）
const playBtn = document.getElementById('playBtn');
const seekBar = document.getElementById('seekBar');
const time = document.getElementById('duration');
const currentTimeEl = document.getElementById('currentTime');

// ミニプレイヤー
const playBtnMini = document.getElementById('mini-playBtn');
const seekBarMini = document.getElementById('mini-seekBar');
const timeMini = document.getElementById('mini-duration');
const currentTimeMini = document.getElementById('mini-currentTime');
const repeatBtn = document.getElementById('mini-repeatBtn');

// ==========================
// 起動時の処理
// ==========================

//オフライン曲を取得
async function getOfflineSongs() {
  const cache = await caches.open("music-app-v1");
  const keys = await cache.keys();

  const songs = [];

  for (const request of keys) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/music-app/offline/") &&
        !url.pathname.endsWith("-cover")) {

      const raw = url.pathname.replace("/music-app/offline/", "");
      const [id, ...nameParts] = raw.split("__");
      const name = nameParts.join("__");

      songs.push({
        id,
        name,          // decode しない
        url: request.url,
        offline: true
      });
    }
  }

  return songs;
}


//  自動でオフライン曲を順番に流す
let offlineIndex = 0;
let offlinePlaylist = [];

function startOfflinePlaylist(songs) {
  offlinePlaylist = songs;
  offlineIndex = 0;
  playOfflineSong();
}

//オフライン曲再生
function playOfflineSong() {
  const song = offlinePlaylist[offlineIndex];
  const audio = document.getElementById("audioPlayer");

  console.log("Playing:", song.url); // ←デバッグ用
  audio.src = song.url;
  audio.play();

  audio.onended = () => {
    offlineIndex = (offlineIndex + 1) % offlinePlaylist.length;
    playOfflineSong();
  };
}

//オフライン曲の表示
function renderOfflineList(songs, targetId) {
  const list = document.getElementById(targetId);
  if (!list) return;

  list.innerHTML = "";

  songs.forEach(async song => {
    const div = document.createElement("div");
    div.className = "song-item";

    // cover は /offline/ID__name-cover のはず

    const coverUrl = song.url + "-cover";
    const songName = decodeURIComponent(song.name);
    div.innerHTML = `
      <img src="${coverUrl}" class="song-cover">

      <div class="song-info">
        <div class="song-title">${songName}</div>
        <div class="song-artist">オフライン保存</div>
      </div>

      <button class="delete-btn">🗑</button>
    `;

    // 削除ボタン
    div.querySelector(".delete-btn").addEventListener("click", async () => {
      await deleteSongOffline(song);
      const updated = await getOfflineSongs();
      renderOfflineList(updated, targetId);
    });

    // 再生（クリックで再生）
    div.addEventListener("click", (e) => {
      if (e.target.closest(".delete-btn")) return;
      playOfflineSong(song);
    });

    list.appendChild(div);
  });
}

window.addEventListener("load", async () => {
  const offlineSongs = await getOfflineSongs();

  console.log("Offline songs:", offlineSongs); // ←デバッグ用

  if (offlineSongs.length > 0) {
    showLoading();  
    // まずオフライン曲だけ表示
    renderOfflineList(offlineSongs, "offlineList");
    hideLoading();
    startOfflinePlaylist(offlineSongs);//曲再生

  } else {
    console.log("オフライン曲が見つからない");
  }
});

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
    showLoading();
    loadOneDriveMusic().finally(() => {
      hideLoading();
    });
  }).catch(err => {
    console.error(err);
    hideLoading();
  });
}

// ==========================
// OneDrive から曲一覧取得
// ==========================
async function loadOneDriveMusic() {
  const res = await fetch("https://graph.microsoft.com/v1.0/me/drive/root:/music", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const musicFolder = await res.json();

  console.log("Music フォルダ情報", musicFolder);

  const songs = await getFilesRecursively(musicFolder.id);

  console.log("見つかった音楽ファイル", songs);

  renderAllLists(songs);

  if (songs.length > 0) {
    // 最初の曲を再生
    playSong(songs[0]);
  } else {
    console.log("再生できる音楽ファイルがありません");
  }
}

// ローディング表示
function showLoading() {
  document.getElementById("loading").style.display = "flex";
}
function hideLoading() {
  document.getElementById("loading").style.display = "none";
}

// 再帰的にファイル取得
async function getFilesRecursively(itemId) {
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${itemId}/children`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json();

  let files = [];

  for (const item of data.value) {
    if (item.folder) {
      const sub = await getFilesRecursively(item.id);
      files.push(...sub);
    } else if (item["@microsoft.graph.downloadUrl"]) {
      files.push(item);
    }
  }

  return files;
}

// ==========================
// オフライン保存関連
// ==========================

// ★ song.id をキーにして、同名ファイルでも上書きされないようにする
async function saveSongOffline(song) {
  const cache = await caches.open("music-app-v1");
  console.log("song object:", song);
  console.log("downloadUrl:", song["@microsoft.graph.downloadUrl"]);


  // OneDrive の name はすでにエンコード済みなので、そのまま使う
  const key = `${song.id}__${song.name}`;

  // 保存パス（encode しない）
  const url = `/music-app/offline/${key}`;

  // 音源を保存
  const response = await fetch(song["@microsoft.graph.downloadUrl"]);
  await cache.put(url, response);

  // cover を保存（存在する場合）
  if (song.coverUrl) {
    const coverResponse = await fetch(song.coverUrl);
    await cache.put(url + "-cover", coverResponse);
  }

  alert("オフライン保存しました");
}


async function isSongOffline(song) {
  const cache = await caches.open("music-app-v1");
  const cached = await cache.match(`/music-app/offline/${song.id}__${song.name}`);
  return !!cached;
}

async function deleteSongOffline(song) {
  const cache = await caches.open("music-app-v1");

  // キャッシュキーを統一
  const key = `${song.id}__${song.name}`;

  const deletedSong = await cache.delete(`/music-app/offline/${key}`);
  const deletedCover = await cache.delete(`/music-app/offline/${key}-cover`);

  if (deletedSong || deletedCover) {
    alert(`${encodeURIComponent(song.name)} のオフラインデータを削除しました`);
  } else {
    alert(`${encodeURIComponent(song.name)} はオフライン保存されていません`);
  }
}


// ==========================
// 再生処理（ここを一本化）
// ==========================
async function playSong(song) {
  console.log("再生要求:", encodeURIComponent(song.name));

  // UI 更新
  updateNowPlayingUI(song);
  enableScrollIfNeeded(".np-title");
  enableScrollIfNeeded(".mini-title");
  enableScrollIfNeeded(".np-artist");
  enableScrollIfNeeded(".mini-artist");

  const cache = await caches.open("music-app-v1");

  // ジャケット画像（オフライン優先）
  const coverOffline = await cache.match(`/music-app/offline/${song.id}-cover`);
  if (coverOffline) {
    const blob = await coverOffline.blob();
    const url = URL.createObjectURL(blob);
    document.querySelector(".np-cover").src = url;
    document.querySelector(".mini-cover").src = url;
  } else {
    const coverUrl = await getCoverImage(song);
    document.querySelector(".np-cover").src = coverUrl;
    document.querySelector(".mini-cover").src = coverUrl;
  }

  // 曲本体（オフライン優先）
  const offline = await cache.match(`/music-app/offline/${song.id}`);
  if (offline) {
    const blob = await offline.blob();
    audio.src = URL.createObjectURL(blob);
    console.log("オフライン再生:", encodeURIComponent(song.name));
  } else {
    audio.src = song["@microsoft.graph.downloadUrl"];
    console.log("オンライン再生:", encodeURIComponent(song.name));
  }

  await audio.play();
  isPlaying = true;

  if (playBtn) playBtn.textContent = '⏸';
  if (playBtnMini) playBtnMini.textContent = '⏸';
}


// ==========================
// プレイヤー共通イベント
// ==========================

// メイン再生ボタン
if (playBtn) {
  playBtn.addEventListener('click', () => {
    if (!isPlaying) {
      audio.play();
      isPlaying = true;
      playBtn.textContent = '⏸';
      if (playBtnMini) playBtnMini.textContent = '⏸';
    } else {
      audio.pause();
      isPlaying = false;
      playBtn.textContent = '▶';
      if (playBtnMini) playBtnMini.textContent = '▶';
    }
  });
}

// ミニ再生ボタン
if (playBtnMini) {
  playBtnMini.addEventListener('click', () => {
    if (!isPlaying) {
      audio.play();
      isPlaying = true;
      playBtnMini.textContent = '⏸';
      if (playBtn) playBtn.textContent = '⏸';
    } else {
      audio.pause();
      isPlaying = false;
      playBtnMini.textContent = '▶';
      if (playBtn) playBtn.textContent = '▶';
    }
  });
}

// リピート
if (repeatBtn) {
  repeatBtn.addEventListener('click', () => {
    isRepeat = !isRepeat;
    audio.loop = isRepeat;
    repeatBtn.style.opacity = isRepeat ? 1 : 0.4;
  });
}

// timeupdate（メイン＋ミニ両方更新）
audio.addEventListener('timeupdate', () => {
  if (audio.duration) {
    const progress = (audio.currentTime / audio.duration) * 100;

    if (seekBar) {
      seekBar.value = progress;
      currentTimeEl.textContent = formatTime(audio.currentTime);
      time.textContent = formatTime(audio.duration);
    }

    if (seekBarMini) {
      seekBarMini.value = progress;
      currentTimeMini.textContent = formatTime(audio.currentTime);
      timeMini.textContent = formatTime(audio.duration);
    }
  }
});

// シークバー操作（メイン）
if (seekBar) {
  seekBar.addEventListener('input', () => {
    if (audio.duration) {
      const newTime = (seekBar.value / 100) * audio.duration;
      audio.currentTime = newTime;
    }
  });
}

// ミニシークバー操作
if (seekBarMini) {
  seekBarMini.addEventListener('input', () => {
    if (audio.duration) {
      const newTime = (seekBarMini.value / 100) * audio.duration;
      audio.currentTime = newTime;
    }
  });
}

// 時間フォーマット
function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ==========================
// 曲一覧表示
// ==========================
function renderSongList(songs, targetId, allSongs = null) {
  const list = document.getElementById(targetId);
  if (!list) return;

  list.innerHTML = "";

  songs.forEach(async song => {
    const div = document.createElement("div");
    div.className = "song-item";

    const offline = await isSongOffline(song);
    const coverUrl = await getCoverImage(song);

    div.innerHTML = `
      <img src="${coverUrl}" class="song-cover">

      <div class="song-info">
        <div class="song-title">${song.name}</div>
        <div class="song-artist">${getArtistName(song)}</div>
      </div>

      <button class="save-btn">${offline ? "✓ 保存済み" : "↓ 保存"}</button>
      ${offline ? `<button class="delete-btn">🗑</button>` : ""}
    `;

    // 再生
    div.addEventListener("click", (e) => {
      if (e.target.closest(".save-btn") || e.target.closest(".delete-btn")) return;
      playSong(song);
      playOfflineSong();
    });


    // 保存
    div.querySelector(".save-btn").addEventListener("click", async () => {
      await saveSongOffline(song);
      renderAllLists(allSongs);
    });

    // 削除
    if (offline) {
      div.querySelector(".delete-btn").addEventListener("click", async () => {
        await deleteSongOffline(song);
        renderAllLists(allSongs);
      });
    }

    list.appendChild(div);
  });
}

async function renderAllLists(oneDriveSongs) {
  const offlineIds = await getOfflineSongs();

  const offlineSongs = oneDriveSongs.filter(song =>
    offlineIds.includes(song.id)
  );

  const cloudSongs = oneDriveSongs.filter(song =>
    !offlineIds.includes(song.id)
  );

  renderOfflineList(offlineSongs, "offlineList");
  renderSongList(cloudSongs, "cloudList", oneDriveSongs);
}

// ==========================
// UI 関連
// ==========================
function updateNowPlayingUI(song) {
  const title = song.name;
  const artist = getArtistName(song);

  const miniTitle = document.querySelector(".mini-title");
  const miniArtist = document.querySelector(".mini-artist");
  const npTitle = document.querySelector(".np-title");
  const npArtist = document.querySelector(".np-artist");

  if (miniTitle) miniTitle.textContent = title;
  if (miniArtist) miniArtist.textContent = artist;
  if (npTitle) npTitle.textContent = title;
  if (npArtist) npArtist.textContent = artist;
}

function getArtistName(song) {
  const path = song.parentReference?.path || "";
  const parts = path.split("/");
  // 例: ["drive", "root:", "music", "宇多田ヒカル", "First Love"]
  return parts[4] || "Unknown";
}

function enableScrollIfNeeded(selector) {
  const el = document.querySelector(selector);
  if (!el) return;
  if (el.scrollWidth > el.clientWidth) {
    el.classList.add("scroll-text");
  } else {
    el.classList.remove("scroll-text");
  }
}

// ジャケット画像取得
async function getCoverImage(song) {
  try {
    // parentReference が無い場合はデフォルト画像
    if (!song.parentReference || !song.parentReference.id) {
      return "assets/images/music-note.png";
    }

    const parentId = song.parentReference.id;

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${parentId}/children`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const data = await res.json();

    // API エラー時
    if (!data || !data.value) {
      return "assets/images/music-note.png";
    }

    // jpg / png を探す
    const image = data.value.find(item =>
      item.name && item.name.match(/\.(jpg|jpeg|png)$/i)
    );

    return image
      ? image["@microsoft.graph.downloadUrl"]
      : "assets/images/music-note.png";

  } catch (err) {
    console.error("カバー画像取得エラー:", err);
    return "assets/images/music-note.png";
  }
}

