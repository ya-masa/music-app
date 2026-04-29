document.querySelectorAll('.card').forEach(card => {
  card.addEventListener('click', () => {
    alert(card.textContent + ' を開きます');
    window.location.href = 'playlist.html?name=' + encodeURIComponent(card.textContent);
  });
});

const row = document.querySelector('.card-row');

row.addEventListener('wheel', (e) => {
  e.preventDefault();
  row.scrollLeft += e.deltaY;
});

// 音源を読み込む（相対パス）
const audio = new Audio('assets/audio/sample.m4a');

// ボタン取得
const playBtn = document.getElementById('playBtn');
const seekBar = document.getElementById('seekBar');
const time = document.getElementById('duration');
const currentTimeEl = document.getElementById('currentTime');

let isPlaying = false;

playBtn.addEventListener('click', () => {
  time.textContent=formatTime(audio.duration);
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

// ① 曲の進行に合わせてバーを動かす
audio.addEventListener('timeupdate', () => {
  const progress = (audio.currentTime / audio.duration) * 100;
  seekBar.value = progress;
});

// ② バーを動かすと再生位置が変わる
seekBar.addEventListener('input', () => {
  const newTime = (seekBar.value / 100) * audio.duration;
  audio.currentTime = newTime;
});

// 再生中に時間更新
audio.addEventListener('timeupdate', () => {
  currentTimeEl.textContent = formatTime(audio.currentTime);
});

// ボタン取得
const playBtnMini = document.getElementById('mini-playBtn');
const seekBarMini = document.getElementById('mini-seekBar');
const timeMini = document.getElementById('mini-duration');
const currentTimeMini= document.getElementById('mini-currentTime');

playBtnMini.addEventListener('click', () => {
  time.textContent=formatTime(audio.duration);
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

// ① 曲の進行に合わせてバーを動かす
audio.addEventListener('timeupdate', () => {
  const progress = (audio.currentTime / audio.duration) * 100;
  seekBarMini.value = progress;
});

// ② バーを動かすと再生位置が変わる
seekBarMini.addEventListener('input', () => {
  const newTime = (seekBar.value / 100) * audio.duration;
  audio.currentTime = newTime;
});

// 再生中に時間更新
audio.addEventListener('timeupdate', () => {
  currentTimeMini.textContent = formatTime(audio.currentTime);
});

//リピートボタン
const repeatBtn = document.getElementById('repeatBtn');
let isRepeat = false;
repeatBtn.addEventListener('click', () => {
  isRepeat = !isRepeat;
  audio.loop = isRepeat;
  repeatBtn.style.opacity = isRepeat ? 1 : 0.4; // ON/OFFの見た目
});


function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
