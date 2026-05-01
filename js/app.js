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

// ログイン処理
function login() {
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
    showLoading();//ローディング中表示
    loadOneDriveMusic();
    hideLoading();//ローディング中の表示停止
  }).catch(err => {
    console.error(err);
    hideLoading();//ローディング中の表示停止
  });
}

//フォルダの中の全 .m4a を集める
async function loadOneDriveMusic() {
  // Music フォルダの ID を取得"https://graph.microsoft.com/v1.0/me/drive/root:/music"
    const res = await fetch("https://graph.microsoft.com/v1.0/me/drive/root:/music", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const musicFolder = await res.json();

  console.log("Music フォルダ情報", musicFolder);

  // ★ 再帰的にファイルを集める
  const songs = await getFilesRecursively(musicFolder.id);

  console.log("見つかった音楽ファイル", songs);

  renderSongList(songs);  // ← 追加

  if (songs.length > 0) {
    playFromOneDrive(songs[0]["@microsoft.graph.downloadUrl"]);
  } else {
    console.log("再生できる音楽ファイルがありません");
  }
}
//フォルダ内を検索
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

//ローディング中表示
function showLoading() {
  document.getElementById("loading").style.display = "flex";
}
//ローディング中表示の停止
function hideLoading() {
  document.getElementById("loading").style.display = "none";
}


//曲をオフライン保存する
async function saveSongOffline(song) {
  const fileName = song.name;

  // ① 曲データを取得
  const songRes = await fetch(song["@microsoft.graph.downloadUrl"]);
  const songBlob = await songRes.blob();

  // ② ジャケット画像URLを取得
  const coverUrl = await getCoverImage(song);

  // ③ ジャケット画像を取得
  const coverRes = await fetch(coverUrl);
  const coverBlob = await coverRes.blob();

  // ④ キャッシュに保存
  const cache = await caches.open("music-app-v1");

  await cache.put(`/offline/${fileName}`, new Response(songBlob));
  await cache.put(`/offline/${fileName}-cover`, new Response(coverBlob));

  alert(`${fileName} とジャケット画像をオフライン保存しました`);
}



// ==========================
// ② 音楽プレイヤー部分
// ==========================

// audio は1つだけ
let audio = new Audio();
let isPlaying = false;

// OneDrive の曲を再生
function playFromOneDrive(url) {
  audio.src = url;
  audio.play();
  isPlaying = true;
  playBtn.textContent = '⏸';
  console.log("再生開始:", url);
}

//オフライン再生用プレーヤー
async function playSong(song) {
  const fileName = song.name;
  const offline = await caches.match(`/offline/${fileName}`);

  // UI 更新（曲名・アーティスト）
  updateNowPlayingUI(song);
  enableScrollIfNeeded(".np-title");
  enableScrollIfNeeded(".mini-title");
  // アーティスト名スクロール
  enableScrollIfNeeded(".np-artist");
  enableScrollIfNeeded(".mini-artist");

  // ★ ジャケット画像を取得して反映　ジャケット画像（オフライン優先）
  const coverOffline = await caches.match(`/offline/${song.name}-cover`);

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

  if (offline) {
    // オフライン再生
    const blob = await offline.blob();
    audio.src = URL.createObjectURL(blob);
    console.log("オフライン再生:", fileName);
  } else {
    // OneDrive から再生
    audio.src = song["@microsoft.graph.downloadUrl"];
    console.log("オンライン再生:", fileName);
  }

  audio.play();
  isPlaying = true;
  playBtn.textContent = '⏸';
}

// 再生ボタン
const playBtn = document.getElementById('playBtn');
const seekBar = document.getElementById('seekBar');
const time = document.getElementById('duration');
const currentTimeEl = document.getElementById('currentTime');

playBtn.addEventListener('click', () => {
  if (!isPlaying) {
    audio.play();
    playBtn.textContent = '⏸';
    isPlaying = true;
  } else {
    audio.pause();
    playBtn.textContent = '▶';
    isPlaying = false;
  }
});

//曲がオフライン保存されているかチェックする
async function isSongOffline(fileName) {
  const cached = await caches.match(`/offline/${fileName}`);
  return !!cached;
}

// シークバー更新
audio.addEventListener('timeupdate', () => {
  const progress = (audio.currentTime / audio.duration) * 100;
  seekBar.value = progress;
  currentTimeEl.textContent = formatTime(audio.currentTime);
  time.textContent = formatTime(audio.duration);
});

// シークバー操作
seekBar.addEventListener('input', () => {
  const newTime = (seekBar.value / 100) * audio.duration;
  audio.currentTime = newTime;
});

// ==========================
// ミニプレイヤー
// ==========================
const playBtnMini = document.getElementById('mini-playBtn');
const seekBarMini = document.getElementById('mini-seekBar');
const timeMini = document.getElementById('mini-duration');
const currentTimeMini = document.getElementById('mini-currentTime');

playBtnMini.addEventListener('click', () => {
  if (!isPlaying) {
    audio.play();
    playBtnMini.textContent = '⏸';
    isPlaying = true;
  } else {
    audio.pause();
    playBtnMini.textContent = '▶';
    isPlaying = false;
  }
});

// ミニプレイヤー更新
audio.addEventListener('timeupdate', () => {
  const progress = (audio.currentTime / audio.duration) * 100;
  seekBarMini.value = progress;
  currentTimeMini.textContent = formatTime(audio.currentTime);
  timeMini.textContent = formatTime(audio.duration);
});

// リピート
const repeatBtn = document.getElementById('repeatBtn');
let isRepeat = false;

repeatBtn.addEventListener('click', () => {
  isRepeat = !isRepeat;
  audio.loop = isRepeat;
  repeatBtn.style.opacity = isRepeat ? 1 : 0.4;
});

// 時間フォーマット
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

//曲一覧表示
//オフライン再生
async function renderAllLists(oneDriveSongs) {
  const offlineNames = await getOfflineSongs();

  // ① オフライン曲一覧
  const offlineList = document.getElementById("offlineList");
  offlineList.innerHTML = "";

  offlineNames.forEach(name => {
    const div = document.createElement("div");
    div.className = "song-item";
    div.innerHTML = `
      <div class="song-title">${name}</div>
      <button class="delete-btn">🗑</button>
    `;
    div.querySelector(".delete-btn").addEventListener("click", async () => {
      await deleteSongOffline({ name });
      renderAllLists(oneDriveSongs);
    });
    offlineList.appendChild(div);
  });

  // ② OneDrive の曲一覧（未保存）
  const cloudList = document.getElementById("cloudList");
  cloudList.innerHTML = "";

  oneDriveSongs.forEach(song => {
    const isOffline = offlineNames.includes(song.name);

    const div = document.createElement("div");
    div.className = "song-item";
    div.innerHTML = `
      <div class="song-title">${song.name}</div>
      ${isOffline ? "✓ 保存済み" : `<button class="save-btn">↓ 保存</button>`}
    `;

    if (!isOffline) {
      div.querySelector(".save-btn").addEventListener("click", async () => {
        await saveSongOffline(song);
        renderAllLists(oneDriveSongs);
      });
    }

    cloudList.appendChild(div);
  });
}


//オフライン再生曲削除
async function deleteSongOffline(song) {
  const fileName = song.name;
  const cache = await caches.open("music-app-v1");

  const deletedSong = await cache.delete(`/offline/${fileName}`);
  const deletedCover = await cache.delete(`/offline/${fileName}-cover`);

  if (deletedSong || deletedCover) {
    alert(`${fileName} のオフラインデータを削除しました`);
  } else {
    alert(`${fileName} はオフライン保存されていません`);
  }
}


//曲表示名変更
function updateNowPlayingUI(song) {
  const title = song.name;
  const artist = getArtistName(song);

  // 大きい再生画面
  document.querySelector(".np-title").textContent = title;
  document.querySelector(".np-artist").textContent = artist;

  // ミニプレイヤー
  document.querySelector(".mini-title").textContent = title;
  document.querySelector(".mini-artist").textContent = artist;
}

//歌手名
function getArtistName(song) {
  const path = song.parentReference?.path || "";
  const parts = path.split("/");

  // 例: ["drive", "root:", "music", "宇多田ヒカル", "First Love"]
  // アーティスト名は index 3
  return parts[3] || "Unknown";
}


//曲名スクロール
function enableScrollIfNeeded(selector) {
  const el = document.querySelector(selector);
  if (el.scrollWidth > el.clientWidth) {
    el.classList.add("scroll-text");
  } else {
    el.classList.remove("scroll-text");
  }
}

//画像がない時はデフォルト画像を表示
async function getCoverImage(song) {
  const parentId = song.parentReference.id;

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${parentId}/children`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const data = await res.json();

  // jpg / png を探す
  const image = data.value.find(item =>
    item.name.match(/\.(jpg|jpeg|png)$/i)
  );

  // ★画像がない時はデフォルト画像を返す
  return image
    ? image["@microsoft.graph.downloadUrl"]
    : "assets/icons/music-note.png";
}

//オフライン曲を探す
async function getOfflineSongs() {
  const cache = await caches.open("music-app-v1");
  const keys = await cache.keys();

  // 曲データだけ抽出（cover は除外）
  return keys
    .filter(req => req.url.includes("/offline/") && !req.url.includes("-cover"))
    .map(req => decodeURIComponent(req.url.split("/offline/")[1]));
}