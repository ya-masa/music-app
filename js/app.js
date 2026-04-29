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

    loadOneDriveMusic();
  }).catch(err => {
    console.error(err);
  });
}

// Music フォルダの中の全 .m4a を集める
async function loadOneDriveMusic() {
  const res = await fetch("https://graph.microsoft.com/v1.0/me/drive/root:/music:/children", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const item = await res.json();

  console.log("Music フォルダの中身", data.value);

  let songs = [];

  // ★ フォルダごとに中身を取得
  for (const item of result.value) {
    if (item.folder) {
      // フォルダならさらに潜る
      const subFiles = await getAllMusicFiles(item.id);
      files = files.concat(subFiles);
    } else {
      // ファイルなら拡張子チェック
      if (item.name.endsWith(".m4a") || item.name.endsWith(".mp3")) {
        files.push({
          name: item.name,
          url: item["@microsoft.graph.downloadUrl"]
        });
      }
    }
  }

  console.log("見つかった .m4a ファイル", files);

  if (songs.length > 0) {
    playFromOneDrive(songs[0]["@microsoft.graph.downloadUrl"]);
  } else {
    console.log("再生できる音楽ファイルがありません");
  }
}

async function getAllMusicFiles(folderId) {
  const result = await client.api(`/me/drive/items/${folderId}/children`).get();
  let files = [];

  for (const item of result.value) {
    if (item.folder) {
      // フォルダならさらに潜る
      const subFiles = await getAllMusicFiles(item.id);
      files = files.concat(subFiles);
    } else {
      // ファイルなら拡張子チェック
      if (item.name.endsWith(".m4a") || item.name.endsWith(".mp3")) {
        files.push({
          name: item.name,
          url: item["@microsoft.graph.downloadUrl"]
        });
      }
    }
  }

  return files;
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
