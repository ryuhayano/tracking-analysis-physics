/*
 * Physics Exam Lab - Tracking Analysis Software
 * Copyright (c) 2025 一般社団法人 国際物理オリンピック2023記念協会
 * Licensed under the Creative Commons BY-NC 4.0 International License.
 * See https://creativecommons.org/licenses/by-nc/4.0/
 */

// ファイル選択時に動画を読み込む
const videoInput = document.getElementById('videoInput');
const video = document.getElementById('video');
const canvas = document.getElementById('videoCanvas');
// const fileNameSpan = document.getElementById('fileName'); // 不要なので削除

let scaleLength = null; // スケールの実長（m）

const MAX_CANVAS_WIDTH = 660;
const MAX_CANVAS_HEIGHT = 480;

let fps = 30; // CSV出力時のみ使用
let videoFps = 30; // 動画制御用（固定値、UIからは変更不可、デフォルト30）
let currentFrame = 0; // 現在のフレーム番号（直接管理）
let startFrame = 0;
let endFrame = 0;
let totalFrames = 0;

const fpsInput = document.getElementById('fpsInput');
const startFrameInput = document.getElementById('startFrameInput');
const endFrameInput = document.getElementById('endFrameInput');
const currentFrameLabel = document.getElementById('currentFrameLabel');

const videoFpsInput = document.getElementById('videoFpsInput');

let trackingMode = false;
let trackingData = []; // [{frame, positions: [{x, y}, ...]}]
let currentObjectIndex = 0; // 今どの物体のクリック待ちか

// 物体ごとの色（最大2個、拡張可）
const objectColors = ['magenta', 'orange', 'cyan', 'lime', 'purple', 'brown'];

// --- 物体数・追跡開始ボタン ---
const objectCountSelect = document.getElementById('objectCountSelect');
const frameIntervalSelect = document.getElementById('frameIntervalSelect');
const startTrackingBtn = document.getElementById('startTrackingBtn');
let objectCount = 1;
let frameInterval = 1;
objectCountSelect.addEventListener('change', () => {
  objectCount = parseInt(objectCountSelect.value) || 1;
});
frameIntervalSelect.addEventListener('change', () => {
  frameInterval = parseInt(frameIntervalSelect.value) || 1;
});
frameInterval = parseInt(frameIntervalSelect.value) || 1;
objectCount = parseInt(objectCountSelect.value) || 1;

// Undoボタンの表示制御
const undoBtn = document.getElementById('undoBtn');
undoBtn.style.display = 'none';

// ガイドテキスト表示用要素を追加
let guideDiv = document.getElementById('guideText');
if (!guideDiv) {
  guideDiv = document.createElement('div');
  guideDiv.id = 'guideText';
  guideDiv.style.margin = '8px';
  guideDiv.style.fontWeight = 'bold';
  guideDiv.style.color = '#c00';
  document.querySelector('.video-container').prepend(guideDiv);
}
// ガイドテキスト本体用spanを追加
let guideTextLabel = document.getElementById('guideTextLabel');
if (!guideTextLabel) {
  guideTextLabel = document.createElement('span');
  guideTextLabel.id = 'guideTextLabel';
  guideDiv.appendChild(guideTextLabel);
}

function updateGuideText(text, color) {
  guideTextLabel.textContent = text || '';
  if (color) {
    guideDiv.style.color = color;
  } else {
    guideDiv.style.color = '#c00';
  }
}

// Undoボタンをガイドテキストの右横に移動する関数
function moveUndoBtnToGuide() {
  if (guideDiv.contains(undoBtn)) {
    // 既にguideDiv内にある場合は何もしない
  } else {
    guideDiv.appendChild(undoBtn);
  }
  undoBtn.style.display = '';
  undoBtn.style.marginLeft = '8px'; // 余白控えめ
  undoBtn.style.fontSize = '0.95em'; // 小さめ
  undoBtn.style.background = '#f9f9f9'; // 薄いグレー
  undoBtn.style.border = '1px solid #aaa'; // 細い枠線
  undoBtn.style.color = '#c00';
  undoBtn.style.fontWeight = 'normal';
  undoBtn.style.borderRadius = '4px';
  undoBtn.style.padding = '1px 8px'; // 小さめ
  undoBtn.style.cursor = 'pointer';
}
// Undoボタンを元の位置に戻す関数
function moveUndoBtnToPanel() {
  const btnGroup = document.querySelector('.button-group');
  if (btnGroup && !btnGroup.contains(undoBtn)) {
    btnGroup.insertBefore(undoBtn, btnGroup.children[4]); // 追跡開始ボタンの次
  }
  undoBtn.style.display = 'none';
  undoBtn.style = '';
}

function updateUndoBtnVisibility() {
  if (trackingMode) {
    moveUndoBtnToGuide();
    // ショートカット案内も表示
    if (!document.getElementById('undoShortcutHint')) {
      const hint = document.createElement('span');
      hint.id = 'undoShortcutHint';
      hint.textContent = '（ZキーまたはBackspaceでもUndo）';
      hint.style.marginLeft = '8px';
      hint.style.fontSize = '0.92em';
      hint.style.color = '#888';
      guideDiv.appendChild(hint);
    }
  } else {
    // Undoボタンを完全に非表示・DOMからも削除
    if (undoBtn.parentNode) {
      undoBtn.parentNode.removeChild(undoBtn);
    }
    // ショートカット案内を消す
    const hint = document.getElementById('undoShortcutHint');
    if (hint) hint.remove();
  }
}

// ショートカットキー対応
window.addEventListener('keydown', function(e) {
  // ESCキーで設定をキャンセル
  if (e.key === 'Escape' && (mode === 'set-scale' || mode === 'set-origin')) {
    e.preventDefault();
    // 設定をリセット
    mode = null;
    scalePoints = [];
    updateGuideText('');
    disableVideoControls(false);
    // ボタンのハイライトを解除
    setScaleBtn.style.background = '';
    setOriginBtn.style.background = '';
    // キャンセルボタンと案内を削除
    const cancelBtn = document.getElementById('cancelBtn');
    if (cancelBtn) cancelBtn.remove();
    const cancelHint = document.getElementById('cancelHint');
    if (cancelHint) cancelHint.remove();
    // 画面を再描画して始点・終点・直線を消去
    drawOverlay();
    return;
  }
  
  // トラッキングモード中のUndo
  if (!trackingMode) return;
  if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') {
    e.preventDefault();
    undoBtn.click();
  }
});

// 追跡モード終了時にUndoボタンを必ず消す（trackingMode=falseになる全ての箇所で呼ぶ）
function endTrackingMode() {
  trackingMode = false;
  updateGuideText('');
  startTrackingBtn.style.background = '';
  objectCountSelect.disabled = false;
  if (frameIntervalSelect) frameIntervalSelect.disabled = false;
  updateUndoBtnVisibility();
}

startTrackingBtn.onclick = () => {
  // 原点・スケール未設定時は警告
  if (scalePoints.length < 2 || !scaleLength || !originPoint) {
    alert('原点とスケールが未設定です。先に原点・スケールを設定してください。');
    return;
  }
  trackingMode = !trackingMode;
  if (trackingMode) {
    currentObjectIndex = 0;
    const intervalText = frameInterval === 1 ? '' : `（${frameInterval}フレームごと）`;
    updateGuideText(`物体${objectCount === 1 ? '' : '1'}の位置をクリックしてください${intervalText}（${objectCount}物体）`, objectColors[0]);
    startTrackingBtn.style.background = '#ffd';
    objectCountSelect.disabled = true;
    if (frameIntervalSelect) frameIntervalSelect.disabled = true;
  } else {
    endTrackingMode();
  }
  updateUndoBtnVisibility();
};

function resizeCanvasToFit() {
  // リサイズ前のcanvasサイズを保存
  const oldCanvasWidth = canvas.width;
  const oldCanvasHeight = canvas.height;
  
  const controlPanel = document.querySelector('.control-panel');
  const controlPanelHeight = controlPanel ? controlPanel.offsetHeight : 0;
  const zoomControls = document.querySelector('.zoom-controls');
  const zoomControlsHeight = zoomControls ? zoomControls.offsetHeight : 0;
  const slider = document.getElementById('frameSlider');
  const verticalMargin = 64; // 下部余白を大きめに
  const horizontalMargin = 24; // 左右余白
  const containerPadding = 20; // video-containerのpadding等
  const MIN_CANVAS_WIDTH = 100;
  const MIN_CANVAS_HEIGHT = 100;

  // スライダーを一時的に最小幅・高さで仮表示
  if (slider) {
    slider.style.width = '100px';
    slider.style.maxWidth = '100vw';
  }

  // 利用可能な領域を計算（全体に8%の余裕を持たせる）
  let availableHeight = (window.innerHeight - controlPanelHeight - zoomControlsHeight - verticalMargin - containerPadding) * 0.92;
  let availableWidth = window.innerWidth - horizontalMargin * 2 - containerPadding;

  let w = availableWidth;
  let h = availableHeight;
  let sliderHeight = slider ? slider.offsetHeight : 0;

  if (video.videoWidth && video.videoHeight) {
    const aspect = video.videoWidth / video.videoHeight;
    // まず高さを仮決定
    h = Math.min(availableHeight - sliderHeight - 16, availableWidth / aspect);
    w = h * aspect;
    // 幅がはみ出す場合は幅優先
    if (w > availableWidth) {
      w = availableWidth;
      h = w / aspect;
    }
    // スライダー分の高さを再考慮
    if (h + sliderHeight + 16 > availableHeight) {
      h = availableHeight - sliderHeight - 16;
      h = Math.max(MIN_CANVAS_HEIGHT, h);
      w = h * (video.videoWidth / video.videoHeight);
      w = Math.max(MIN_CANVAS_WIDTH, w);
      canvas.width = Math.floor(w);
      canvas.height = Math.floor(h);
      // .video-containerの幅を取得
      const container = document.querySelector('.video-container');
      const containerWidth = container ? container.clientWidth : window.innerWidth;
      const sliderMargin = 48;
      const sliderWidth = Math.max(100, Math.min(600, containerWidth - sliderMargin));
      slider.style.width = sliderWidth + 'px';
      slider.style.margin = '12px auto 0 auto'; // 中央寄せを強制
    }
  }

  // 最小サイズを保証
  w = Math.max(MIN_CANVAS_WIDTH, w);
  h = Math.max(MIN_CANVAS_HEIGHT, h);

  canvas.width = Math.floor(w);
  canvas.height = Math.floor(h);

  // スライダーの幅もcanvasに合わせる
  if (slider) {
    const sliderMaxWidth = 600;
    const sliderMargin = 48;
    const sliderWidth = Math.max(100, Math.min(sliderMaxWidth, window.innerWidth - sliderMargin));
    slider.style.width = sliderWidth + 'px';
    slider.style.maxWidth = '100vw';
    slider.style.margin = '12px auto 0 auto'; // 中央寄せを強制
  }

  // canvasの高さを決めた後、スライダーの高さを再取得し、必要ならcanvasの高さを再調整
  if (slider) {
    let newSliderHeight = slider.offsetHeight;
    if (h + newSliderHeight + 16 > availableHeight) {
      h = availableHeight - newSliderHeight - 16;
      h = Math.max(MIN_CANVAS_HEIGHT, h);
      w = h * (video.videoWidth / video.videoHeight);
      w = Math.max(MIN_CANVAS_WIDTH, w);
      canvas.width = Math.floor(w);
      canvas.height = Math.floor(h);
      // .video-containerの幅を取得
      const container = document.querySelector('.video-container');
      const containerWidth = container ? container.clientWidth : window.innerWidth;
      const sliderMargin = 48;
      const sliderWidth = Math.max(100, Math.min(600, containerWidth - sliderMargin));
      slider.style.width = sliderWidth + 'px';
      slider.style.margin = '12px auto 0 auto'; // 中央寄せを強制
    }
  }

  // 既存の座標点をリサイズ後のcanvasサイズに合わせて変換
  if (oldCanvasWidth > 0 && oldCanvasHeight > 0 && (oldCanvasWidth !== canvas.width || oldCanvasHeight !== canvas.height)) {
    const scaleX = canvas.width / oldCanvasWidth;
    const scaleY = canvas.height / oldCanvasHeight;
    
    // スケール点の座標を変換
    if (scalePoints.length > 0) {
      scalePoints.forEach(point => {
        point.x *= scaleX;
        point.y *= scaleY;
      });
    }
    
    // 原点の座標を変換
    if (originPoint) {
      originPoint.x *= scaleX;
      originPoint.y *= scaleY;
    }
    
    // ズームオフセットも調整
    zoomOffsetX *= scaleX;
    zoomOffsetY *= scaleY;
  }

  // ズーム状態はリセットしない
  // zoomFactor = 1.0;
  // zoomOffsetX = 0;
  // zoomOffsetY = 0;
  drawOverlay();
}

videoInput.addEventListener('change', function() {
  const file = this.files[0];
  if (file) {
    const url = URL.createObjectURL(file);
    video.src = url;
    video.controls = false;
    // fileNameSpan.textContent = file.name; // 不要なので削除
    
    // 動画の読み込みが完了したらリサイズを実行
    video.addEventListener('loadeddata', function() {
      setTimeout(() => {
        resizeCanvasToFit();
      }, 100);
    }, { once: true });
  }
});

// 再生・停止・フレーム送り/戻し（雛形）
document.getElementById('playBtn').onclick = () => video.play();
document.getElementById('pauseBtn').onclick = () => video.pause();

document.getElementById('nextFrameBtn').onclick = () => {
  video.pause();
  if (currentFrame < endFrame) {
    currentFrame++;
    video.currentTime = currentFrame / videoFps;
    updateCurrentFrameLabel();
  }
};

// 1フレーム戻るボタンの拡張
const prevFrameBtn = document.getElementById('prevFrameBtn');
prevFrameBtn.onclick = () => {
  if (trackingMode) {
    const idx = trackingData.findIndex(d => d.frame === currentFrame);
    if (idx !== -1) {
      trackingData.splice(idx, 1);
      drawOverlay();
    }
    currentObjectIndex = 0;
    updateGuideText(`物体1の位置をクリックしてください（${objectCount}物体）`, objectColors[0]);
  }
  if (currentFrame > startFrame) {
    currentFrame--;
    video.currentTime = currentFrame / videoFps;
    updateCurrentFrameLabel();
  }
};

// --- スケール・原点・回転設定用 追加コード ---
let mode = null; // 'set-scale' | 'set-origin' | null
let scalePoints = [];
let originPoint = null;

// スケール設定ボタン
const setScaleBtn = document.getElementById('setScaleBtn');
setScaleBtn.onclick = () => {
  if (mode === 'set-scale') {
    // 既に設定中の場合はキャンセル
    mode = null;
    scalePoints = [];
    updateGuideText('');
    disableVideoControls(false);
    // ボタンのハイライトを解除
    setScaleBtn.style.background = '';
    // キャンセルボタンと案内を削除
    const cancelBtn = document.getElementById('cancelBtn');
    if (cancelBtn) cancelBtn.remove();
    const cancelHint = document.getElementById('cancelHint');
    if (cancelHint) cancelHint.remove();
    // 画面を再描画して始点・終点・直線を消去
    drawOverlay();
  } else {
    // 新規設定開始
  mode = 'set-scale';
  scalePoints = [];
  updateGuideText('スケール設定: 始点と終点をクリックしてください');
  disableVideoControls(true);
    // ボタンをハイライト表示
    setScaleBtn.style.background = '#ffd';
    // キャンセルボタンをガイドテキストに追加
    if (!document.getElementById('cancelBtn')) {
      const cancelBtn = document.createElement('button');
      cancelBtn.id = 'cancelBtn';
      cancelBtn.textContent = 'キャンセル';
      cancelBtn.style.marginLeft = '8px';
      cancelBtn.style.fontSize = '0.95em';
      cancelBtn.style.background = '#f9f9f9';
      cancelBtn.style.border = '1px solid #aaa';
      cancelBtn.style.color = '#c00';
      cancelBtn.style.fontWeight = 'normal';
      cancelBtn.style.borderRadius = '4px';
      cancelBtn.style.padding = '1px 8px';
      cancelBtn.style.cursor = 'pointer';
      cancelBtn.onclick = () => {
        // キャンセル処理
        mode = null;
        scalePoints = [];
        updateGuideText('');
        disableVideoControls(false);
        // ボタンのハイライトを解除
        setScaleBtn.style.background = '';
        // キャンセルボタンと案内を削除
        const cancelBtn = document.getElementById('cancelBtn');
        if (cancelBtn) cancelBtn.remove();
        const cancelHint = document.getElementById('cancelHint');
        if (cancelHint) cancelHint.remove();
        // 画面を再描画
        drawOverlay();
      };
      guideDiv.appendChild(cancelBtn);
    }
    // ガイドテキストにキャンセル案内を追加
    if (!document.getElementById('cancelHint')) {
      const hint = document.createElement('span');
      hint.id = 'cancelHint';
      hint.textContent = '（ESCキーでもキャンセル）';
      hint.style.marginLeft = '8px';
      hint.style.fontSize = '0.92em';
      hint.style.color = '#888';
      guideDiv.appendChild(hint);
    }
  }
};

// 原点設定ボタン
const setOriginBtn = document.getElementById('setOriginBtn');
setOriginBtn.onclick = () => {
  if (mode === 'set-origin') {
    // 既に設定中の場合はキャンセル
    mode = null;
    updateGuideText('');
    disableVideoControls(false);
    // ボタンのハイライトを解除
    setOriginBtn.style.background = '';
    // キャンセルボタンと案内を削除
    const cancelBtn = document.getElementById('cancelBtn');
    if (cancelBtn) cancelBtn.remove();
    const cancelHint = document.getElementById('cancelHint');
    if (cancelHint) cancelHint.remove();
    // 画面を再描画（原点設定の場合は特に消去するものはないが、一貫性のため）
    drawOverlay();
  } else {
    // 新規設定開始
  mode = 'set-origin';
  updateGuideText('原点設定: 原点となる点をクリックしてください');
  disableVideoControls(true);
    // ボタンをハイライト表示
    setOriginBtn.style.background = '#ffd';
    // キャンセルボタンをガイドテキストに追加
    if (!document.getElementById('cancelBtn')) {
      const cancelBtn = document.createElement('button');
      cancelBtn.id = 'cancelBtn';
      cancelBtn.textContent = 'キャンセル';
      cancelBtn.style.marginLeft = '8px';
      cancelBtn.style.fontSize = '0.95em';
      cancelBtn.style.background = '#f9f9f9';
      cancelBtn.style.border = '1px solid #aaa';
      cancelBtn.style.color = '#c00';
      cancelBtn.style.fontWeight = 'normal';
      cancelBtn.style.borderRadius = '4px';
      cancelBtn.style.padding = '1px 8px';
      cancelBtn.style.cursor = 'pointer';
      cancelBtn.onclick = () => {
        // キャンセル処理
        mode = null;
        updateGuideText('');
        disableVideoControls(false);
        // ボタンのハイライトを解除
        setOriginBtn.style.background = '';
        // キャンセルボタンと案内を削除
        const cancelBtn = document.getElementById('cancelBtn');
        if (cancelBtn) cancelBtn.remove();
        const cancelHint = document.getElementById('cancelHint');
        if (cancelHint) cancelHint.remove();
        // 画面を再描画
        drawOverlay();
      };
      guideDiv.appendChild(cancelBtn);
    }
    // ガイドテキストにキャンセル案内を追加
    if (!document.getElementById('cancelHint')) {
      const hint = document.createElement('span');
      hint.id = 'cancelHint';
      hint.textContent = '（ESCキーでもキャンセル）';
      hint.style.marginLeft = '8px';
      hint.style.fontSize = '0.92em';
      hint.style.color = '#888';
      guideDiv.appendChild(hint);
    }
  }
};

// 物理座標変換（画面基準の水平・鉛直軸に固定、スケール線の傾き分だけ補正）
function getPhysicalCoords(canvasX, canvasY) {
  if (scalePoints.length < 2 || !scaleLength || !originPoint) return null;
  const [p0, p1] = scalePoints;
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const pixelDist = Math.sqrt(dx * dx + dy * dy);
  if (pixelDist === 0) return null;
  // theta: スケール線の鉛直（Y軸）からのずれ
  let theta = Math.atan2(dx, -dy); // dx, -dyで鉛直基準
  // 始点が終点より下/右の場合、符号を反転して常にY軸上向き
  if (dy > 0) theta += Math.PI;
  // 原点からの相対座標
  const relX = canvasX - originPoint.x;
  const relY = canvasY - originPoint.y;
  // スケール線の傾き分だけ逆回転（画面基準の水平・鉛直軸に合わせる）
  const x_rot =  Math.cos(-theta) * relX - Math.sin(-theta) * relY;
  const y_rot =  Math.sin(-theta) * relX + Math.cos(-theta) * relY;
  // Y軸方向のスケールでメートル換算
  const scale = scaleLength / pixelDist;
  const x_phys = x_rot * scale;
  const y_phys = y_rot * scale;
  return { x: x_phys, y: y_phys };
}

// 物理→canvas座標（画面基準の水平・鉛直軸に固定、スケール線の傾き分だけ補正）
function physicalToCanvas(x_phys, y_phys) {
  if (scalePoints.length < 2 || !scaleLength || !originPoint) return null;
  const [p0, p1] = scalePoints;
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const pixelDist = Math.sqrt(dx * dx + dy * dy);
  if (pixelDist === 0) return null;
  let theta = Math.atan2(dx, -dy);
  if (dy > 0) theta += Math.PI;
  // メートル→ピクセル
  const scale = pixelDist / scaleLength;
  // 画面基準の水平・鉛直軸からスケール線の向きに回転
  const x_rot =  Math.cos(theta) * x_phys - Math.sin(theta) * y_phys;
  const y_rot =  Math.sin(theta) * x_phys + Math.cos(theta) * y_phys;
  const relX = x_rot * scale;
  const relY = y_rot * scale;
  const x = originPoint.x + relX;
  const y = originPoint.y + relY;
  return { x: x, y: y };
}

// 動画のメタデータが読み込まれたらcanvasサイズを合わせる
video.addEventListener('loadedmetadata', function() {
  // 少し遅延を入れてからリサイズを実行（DOM要素のサイズが確定してから）
  setTimeout(() => {
    resizeCanvasToFit();
  }, 100);
  // 動画制御用fpsは固定値（30）
  videoFps = 30;
  totalFrames = Math.floor(video.duration * videoFps);
  currentFrame = 0;
  startFrame = 0;
  endFrame = totalFrames - 1;
  startFrameInput.value = startFrame;
  endFrameInput.value = endFrame;
  frameSlider.min = startFrame;
  frameSlider.max = endFrame;
  frameSlider.value = 0;
  updateCurrentFrameLabel();
  drawOverlay();
});

// ウィンドウリサイズ時もcanvasサイズを再調整
window.addEventListener('resize', function() {
  // リサイズの頻度を制限（パフォーマンス向上）
  clearTimeout(window.resizeTimeout);
  window.resizeTimeout = setTimeout(() => {
    resizeCanvasToFit();
    drawOverlay();
  }, 100);
});

let zoomFactor = 1.0;
let zoomOffsetX = 0;
let zoomOffsetY = 0;
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let dragOffsetStart = { x: 0, y: 0 };
let mouseDownOnCanvas = false;
let clickStart = null;
let dragHappened = false;

const zoomInBtn = document.getElementById('zoomInBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const zoomResetBtn = document.getElementById('zoomResetBtn');
const zoomLevelLabel = document.getElementById('zoomLevelLabel');

function updateZoomLabel() {
  zoomLevelLabel.textContent = `x${zoomFactor.toFixed(2)}`;
}

zoomInBtn.onclick = () => {
  zoomFactor = Math.min(zoomFactor * 1.25, 10);
  updateZoomLabel();
  drawOverlay();
};
zoomOutBtn.onclick = () => {
  zoomFactor = Math.max(zoomFactor / 1.25, 0.1);
  updateZoomLabel();
  drawOverlay();
};
zoomResetBtn.onclick = () => {
  zoomFactor = 1.0;
  zoomOffsetX = 0;
  zoomOffsetY = 0;
  updateZoomLabel();
  drawOverlay();
};

updateZoomLabel();

// canvasドラッグでオフセット移動
canvas.addEventListener('mousedown', function(e) {
  isDragging = true;
  dragHappened = false;
  dragStart = { x: e.clientX, y: e.clientY };
  dragOffsetStart = { x: zoomOffsetX, y: zoomOffsetY };
  mouseDownOnCanvas = true;
  clickStart = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('mousemove', function(e) {
  if (isDragging) {
    dragHappened = true;
    // ドラッグ中
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    zoomOffsetX = dragOffsetStart.x + dx;
    zoomOffsetY = dragOffsetStart.y + dy;
    drawOverlay();
    canvas.style.cursor = 'grabbing';
  } else {
    // ドラッグしていないときのカーソル切り替え
    if (mode === 'set-scale' || mode === 'set-origin') {
      canvas.style.cursor = 'crosshair';
    } else if (trackingMode) {
      canvas.style.cursor = 'crosshair';
    } else {
      canvas.style.cursor = 'grab';
    }
  }
});
canvas.addEventListener('mouseup', function(e) {
  if (!isDragging) return;
  isDragging = false;
  if (!mouseDownOnCanvas) return;
  mouseDownOnCanvas = false;
  if (!clickStart) return;
  const dx = e.clientX - clickStart.x;
  const dy = e.clientY - clickStart.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  // trackingMode時、「ドラッグしていない」かつ「距離が小さい」場合のみ記録
  if (trackingMode && !dragHappened && dist < 5) {
    const { x, y } = getCanvasCoords(e);
    const phys = getPhysicalCoords(x, y);
    if (phys) {
      if (currentFrame > endFrame) {
        endTrackingMode();
        return;
      }
      let frameData = trackingData.find(d => d.frame === currentFrame);
      if (!frameData) {
        frameData = { frame: currentFrame, positions: Array(objectCount).fill(null) };
        trackingData.push(frameData);
      }
      frameData.positions[currentObjectIndex] = { x: phys.x, y: phys.y };
      drawOverlay();
      updateUndoBtnVisibility();
      currentObjectIndex++;
      if (currentObjectIndex >= objectCount) {
        currentObjectIndex = 0;
        currentFrame += frameInterval;
        video.currentTime = currentFrame / videoFps;
        updateCurrentFrameLabel();
        updateUndoBtnVisibility();
      }
      if (trackingMode) {
        if (currentFrame > endFrame) {
          endTrackingMode();
        } else {
          const intervalText = frameInterval === 1 ? '' : `（${frameInterval}フレームごと）`;
          updateGuideText(`物体${currentObjectIndex + 1}の位置をクリックしてください${intervalText}（${objectCount}物体）`, objectColors[currentObjectIndex % objectColors.length]);
        }
      }
    } else {
      alert('スケール・原点・スケール長が未設定です');
    }
  }
  clickStart = null;
  dragHappened = false;
  // カーソルをcrosshairに戻す
  if (trackingMode) {
    canvas.style.cursor = 'crosshair';
  }
});
window.addEventListener('mouseup', function(e) {
  isDragging = false;
  mouseDownOnCanvas = false;
  clickStart = null;
  dragHappened = false;
});

// drawOverlay: 物体ごとの点描画も保存値そのまま（符号反転・入れ替えなし）
function drawOverlay() {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(canvas.width / 2 + zoomOffsetX, canvas.height / 2 + zoomOffsetY);
  ctx.scale(zoomFactor, zoomFactor);
  if (video.videoWidth && video.videoHeight) {
    // 動画を中心に描画
    ctx.drawImage(video, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
  }
  // スケール点
  ctx.fillStyle = 'blue';
  scalePoints.forEach(pt => {
    ctx.beginPath();
    ctx.arc(pt.x - canvas.width/2, pt.y - canvas.height/2, 3.3, 0, 2 * Math.PI);
    ctx.fill();
  });
  
  // スケール線と距離表示
  if (scalePoints.length >= 2) {
    const [p0, p1] = scalePoints;
    // スケール線を描画
    ctx.strokeStyle = 'blue';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p0.x - canvas.width/2, p0.y - canvas.height/2);
    ctx.lineTo(p1.x - canvas.width/2, p1.y - canvas.height/2);
    ctx.stroke();
    
    // 距離を表示（スケール長が設定されている場合のみ）
    if (scaleLength !== null) {
      const midX = (p0.x + p1.x) / 2 - canvas.width/2;
      const midY = (p0.y + p1.y) / 2 - canvas.height/2;
      
      ctx.fillStyle = 'blue';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // 背景を白で塗りつぶして文字を見やすくする
      const text = `${scaleLength} m`;
      const textMetrics = ctx.measureText(text);
      const padding = 2;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fillRect(
        midX - textMetrics.width/2 - padding, 
        midY - 6 - padding, 
        textMetrics.width + padding * 2, 
        12 + padding * 2
      );
      
      // 文字を描画
      ctx.fillStyle = 'blue';
      ctx.fillText(text, midX, midY);
    }
  }
  // 原点
  if (originPoint) {
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(originPoint.x - canvas.width/2, originPoint.y - canvas.height/2, 9, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(originPoint.x - 12 - canvas.width/2, originPoint.y - canvas.height/2);
    ctx.lineTo(originPoint.x + 12 - canvas.width/2, originPoint.y - canvas.height/2);
    ctx.moveTo(originPoint.x - canvas.width/2, originPoint.y - 12 - canvas.height/2);
    ctx.lineTo(originPoint.x - canvas.width/2, originPoint.y + 12 - canvas.height/2);
    ctx.stroke();
  }
  // 記録点（物体ごとに色分け）
  trackingData.forEach(d => {
    if (!d.positions) return;
    d.positions.forEach((pos, idx) => {
      if (!pos) return;
      const pt = physicalToCanvas(pos.x, pos.y);
      if (pt) {
        ctx.fillStyle = objectColors[idx % objectColors.length];
        ctx.beginPath();
        ctx.arc(pt.x - canvas.width/2, pt.y - canvas.height/2, 3, 0, 2 * Math.PI);
        ctx.fill();
      }
    });
  });
  // 座標軸を描画
  drawCoordinateAxes(ctx, canvas.width, canvas.height);
  ctx.restore();
}

// クリック座標もズーム・オフセットを考慮
function getCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const cw = canvas.width, ch = canvas.height;
  const vw = video.videoWidth, vh = video.videoHeight;
  let dw = cw, dh = ch, dx = 0, dy = 0;
  if (vw && vh) {
    const cr = cw / ch, vr = vw / vh;
    if (cr > vr) {
      dh = ch;
      dw = ch * vr;
      dx = (cw - dw) / 2;
    } else {
      dw = cw;
      dh = cw / vr;
      dy = (ch - dh) / 2;
    }
    // クリック座標を動画描画領域基準に変換
    const cx = (x - (dx + dw / 2) - zoomOffsetX) / zoomFactor + dw / 2;
    const cy = (y - (dy + dh / 2) - zoomOffsetY) / zoomFactor + dh / 2;
    // ★ここでdx, dyは加えない（動画描画領域内の座標にする）
    return { x: cx, y: cy };
  }
  return { x, y };
}

// canvasクリック時の座標取得をgetCanvasCoordsに変更
canvas.addEventListener('click', function(e) {
  const { x, y } = getCanvasCoords(e);

  if (mode) {
    // そのままcanvas座標として記録
    if (mode === 'set-scale') {
      scalePoints.push({ x, y });
      drawOverlay(); // まず青マーカーを描画
      if (scalePoints.length === 2) {
        setTimeout(() => {
          const proceed = confirm('スケール設定を続行しますか？\n\n「OK」: 距離を入力して設定完了\n「キャンセル」: 設定をキャンセル');
          if (proceed) {
            // OKが押された場合、距離入力を求める
          const len = prompt('2点間の実際の長さをメートル単位で入力してください');
          if (len && !isNaN(len)) {
            scaleLength = parseFloat(len);
            drawOverlay(); // スケール設定完了時に座標軸を表示
            } else if (len !== null) {
              // 空文字や無効な値の場合
              alert('有効な数値を入力してください');
              scaleLength = null;
          } else {
               // キャンセルボタンが押された場合
            scaleLength = null;
               scalePoints = [];
               // 画面を再描画して始点・終点・直線を消去
               drawOverlay();
             }
          } else {
            // キャンセルが押された場合
            scaleLength = null;
            scalePoints = [];
            // 画面を再描画して始点・終点・直線を消去
            drawOverlay();
          }
          mode = null;
          updateGuideText('');
          disableVideoControls(false);
          // ボタンのハイライトを解除
          setScaleBtn.style.background = '';
          // キャンセルボタンと案内を削除
          const cancelBtn = document.getElementById('cancelBtn');
          if (cancelBtn) cancelBtn.remove();
          const cancelHint = document.getElementById('cancelHint');
          if (cancelHint) cancelHint.remove();
        }, 50); // 描画後にconfirmを出す
      } else {
        updateGuideText('スケール設定: 2点目（終点）をクリックしてください');
      }
      return;
    } else if (mode === 'set-origin') {
      originPoint = { x, y };
      mode = null;
      updateGuideText('');
      disableVideoControls(false);
      // ボタンのハイライトを解除
      setOriginBtn.style.background = '';
      // キャンセルボタンと案内を削除
      const cancelBtn = document.getElementById('cancelBtn');
      if (cancelBtn) cancelBtn.remove();
      const cancelHint = document.getElementById('cancelHint');
      if (cancelHint) cancelHint.remove();
      drawOverlay(); // 原点設定完了時に座標軸を表示
    }
    return;
  }

  // 物理座標変換（デバッグ用）
  const phys = getPhysicalCoords(x, y);
  if (phys) {
    // 逆変換で位置を確認（必要に応じてデバッグ出力を有効化）
    const backToCanvas = physicalToCanvas(phys.x, phys.y);
  }
});

// 動画コントロールの有効/無効化
function disableVideoControls(disable) {
  document.getElementById('playBtn').disabled = disable;
  document.getElementById('pauseBtn').disabled = disable;
  document.getElementById('prevFrameBtn').disabled = disable;
  document.getElementById('nextFrameBtn').disabled = disable;
}

// Canvasに動画フレームを描画（雛形）
video.addEventListener('play', function() {
  function drawFrame() {
    if (!video.paused && !video.ended) {
      drawOverlay();
      requestAnimationFrame(drawFrame);
    }
  }
  drawFrame();
});

// 動画停止時も最後のフレームをCanvasに描画
video.addEventListener('pause', function() {
  drawOverlay();
});

// 動画フレームが更新されたときもoverlayを描画
video.addEventListener('seeked', function() {
  drawOverlay();
});

// 初期化時もcanvasに描画
video.addEventListener('loadeddata', function() {
  drawOverlay();
});

// video要素は常に非表示
video.style.display = 'none';

// 全角数字を半角に変換する関数
function toHalfWidth(str) {
  return str.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
}
// 数字入力欄を正規化（全角→半角、半角数字以外除去）
function normalizeNumberInput(input) {
  let before = input.value;
  let val = toHalfWidth(before);
  // 数字以外が含まれていたらエラー表示
  if (/[^0-9]/.test(val)) {
    input.style.border = '2px solid red';
    input.title = '半角数字のみ入力してください（全角数字は自動変換されます）';
  } else {
    input.style.border = '';
    input.title = '';
  }
  val = val.replace(/[^0-9]/g, '');
  // 変換前と変換後が異なる場合のみ再代入
  if (before !== val) {
    input.value = val;
  }
}
let isComposingFps = false;
let isComposingStart = false;
let isComposingEnd = false;

fpsInput.addEventListener('compositionstart', () => { isComposingFps = true; });
fpsInput.addEventListener('compositionend', () => {
  isComposingFps = false;
  normalizeNumberInput(fpsInput);
});
fpsInput.addEventListener('input', function() {
  if (!isComposingFps) normalizeNumberInput(fpsInput);
});

startFrameInput.addEventListener('compositionstart', () => { isComposingStart = true; });
startFrameInput.addEventListener('compositionend', () => {
  isComposingStart = false;
  normalizeNumberInput(startFrameInput);
});
startFrameInput.addEventListener('input', function() {
  if (!isComposingStart) normalizeNumberInput(startFrameInput);
});

endFrameInput.addEventListener('compositionstart', () => { isComposingEnd = true; });
endFrameInput.addEventListener('compositionend', () => {
  isComposingEnd = false;
  normalizeNumberInput(endFrameInput);
});
endFrameInput.addEventListener('input', function() {
  if (!isComposingEnd) normalizeNumberInput(endFrameInput);
});

// 解析開始・終了フレーム入力欄の変更を反映
startFrameInput.addEventListener('input', function() {
  normalizeNumberInput(startFrameInput);
});
startFrameInput.addEventListener('change', function() {
  startFrame = parseInt(startFrameInput.value) || 0;
  frameSlider.min = startFrame;
  // 範囲外なら近い方にcurrentFrameを移動
  let moved = false;
  if (currentFrame < startFrame || currentFrame > endFrame) {
    if (Math.abs(currentFrame - startFrame) <= Math.abs(currentFrame - endFrame)) {
      currentFrame = startFrame;
    } else {
      currentFrame = endFrame;
    }
    frameSlider.value = currentFrame;
    moved = true;
  }
  if (moved) {
    video.currentTime = currentFrame / videoFps;
  }
  updateCurrentFrameLabel();
});
endFrameInput.addEventListener('input', function() {
  normalizeNumberInput(endFrameInput);
});
endFrameInput.addEventListener('change', function() {
  endFrame = parseInt(endFrameInput.value) || (totalFrames - 1);
  frameSlider.max = endFrame;
  // 範囲外なら近い方にcurrentFrameを移動
  let moved = false;
  if (currentFrame < startFrame || currentFrame > endFrame) {
    if (Math.abs(currentFrame - startFrame) <= Math.abs(currentFrame - endFrame)) {
      currentFrame = startFrame;
    } else {
      currentFrame = endFrame;
    }
    frameSlider.value = currentFrame;
    moved = true;
  }
  if (moved) {
    video.currentTime = currentFrame / videoFps;
  }
  updateCurrentFrameLabel();
});

// 現在のフレーム番号を表示
function updateCurrentFrameLabel() {
  currentFrameLabel.textContent = `現在フレーム: ${currentFrame}`;
}

// スライダーと動画の同期
const frameSlider = document.getElementById('frameSlider');

// スライダー操作で動画のcurrentTimeを変更
frameSlider.addEventListener('input', function() {
  currentFrame = parseInt(frameSlider.value) || 0;
  video.currentTime = currentFrame / videoFps;
  updateCurrentFrameLabel();
});

// 動画の再生位置が変わったらスライダーも追従
video.addEventListener('timeupdate', function() {
  currentFrame = Math.round(video.currentTime * videoFps);
  frameSlider.value = currentFrame;
  updateCurrentFrameLabel();
  // 終了フレームに到達したら一時停止のみ（巻き戻しやスライダー操作は妨げない）
  if (currentFrame >= endFrame && !video.paused) {
    video.pause();
    // currentTimeをendFrameに強制セット
    video.currentTime = endFrame / videoFps;
    currentFrame = endFrame;
  }
});

const exportCsvBtn = document.getElementById('exportCsvBtn');
exportCsvBtn.onclick = () => {
  if (!trackingData.length) {
    alert('記録データがありません');
    return;
  }
  // ユーザー入力のfpsを取得
  const fps = parseFloat(fpsInput.value) || 30;
  // ヘッダー生成
  let header = 'time(s)';
  for (let i = 0; i < objectCount; i++) {
    header += `,x${i+1}(m),y${i+1}(m)`;
  }
  header += '\n';
  // データ行生成
  let csv = header;
  // スケール線の向きを判定
  let isHorizontal = false;
  if (scalePoints.length >= 2) {
    const [p0, p1] = scalePoints;
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    isHorizontal = Math.abs(dx) > Math.abs(dy);
  }
  // フレーム順にソート
  const sorted = trackingData.slice().sort((a, b) => a.frame - b.frame);
  sorted.forEach(d => {
    const t = ((d.frame - startFrame) / fps).toFixed(3);
    let row = [t];
    for (let i = 0; i < objectCount; i++) {
      const pos = d.positions && d.positions[i];
      if (pos) {
        if (isHorizontal) {
          row.push(pos.y.toFixed(3), pos.x.toFixed(3));
        } else {
          row.push(pos.x.toFixed(3), (-pos.y).toFixed(3));
        }
      } else {
        row.push('', '');
      }
    }
    csv += row.join(',') + '\n';
  });
  let fname = prompt('保存するファイル名を入力してください（例: data.csv）', 'tracking_data.csv');
  if (!fname) fname = 'tracking_data.csv';
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * 座標軸を描画（画面基準の水平・鉛直軸で描画）
 * X軸: 緑色、スケール線の垂直方向
 * Y軸: 青色、スケール線の方向
 */
function drawCoordinateAxes(ctx, cw, ch) {
  if (!originPoint || scalePoints.length < 2 || !scaleLength) return;
  ctx.save();
  ctx.globalAlpha = 0.4;
  const [p0, p1] = scalePoints;
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const pixelDist = Math.sqrt(dx * dx + dy * dy);
  // スケール線の角度（水平/垂直からのずれ）
  // 座標変換と同じ角度計算を使用
  let theta;
  if (Math.abs(dx) > Math.abs(dy)) {
    // ほぼ水平の場合（微小角度補正を保持）
    if (dx > 0) {
      // 左→右の場合
      theta = Math.atan2(dy, dx); // 微小角度補正
    } else {
      // 右→左の場合
      theta = Math.atan2(dy, dx) + Math.PI; // 微小角度補正 + 180度
    }
  } else {
    // ほぼ鉛直の場合
    theta = Math.atan2(dx, -dy); // dx, -dyで鉛直基準
    if (dy > 0) theta += Math.PI;
  }
  let axisLength = Math.min(cw, ch) * 0.25;
  ctx.translate(originPoint.x - cw / 2, originPoint.y - ch / 2);
  ctx.rotate(theta);
  // X軸（スケール線の法線方向）
  ctx.strokeStyle = '#0f0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-axisLength, 0);
  ctx.lineTo(axisLength, 0);
  ctx.stroke();
  // X軸矢印（右向き）
  ctx.save();
  ctx.translate(axisLength, 0);
  ctx.rotate(0);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-10, -5);
  ctx.moveTo(0, 0);
  ctx.lineTo(-10, 5);
  ctx.stroke();
  ctx.restore();
  // Y軸（スケール線の向き）
  ctx.strokeStyle = '#00f';
  ctx.beginPath();
  ctx.moveTo(0, axisLength);
  ctx.lineTo(0, -axisLength);
  ctx.stroke();
  // Y軸矢印（上向き）
  ctx.save();
  ctx.translate(0, -axisLength);
  ctx.rotate(-Math.PI / 2);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-10, -5);
  ctx.moveTo(0, 0);
  ctx.lineTo(-10, 5);
  ctx.stroke();
  ctx.restore();
  // 目盛り（X軸）
  const scale = scaleLength / pixelDist;
  const tickSpacing = scaleLength / 10;
  const pixelTickSpacing = tickSpacing / scale;
  ctx.strokeStyle = '#0f0';
  ctx.lineWidth = 1;
  for (let i = -5; i <= 5; i++) {
    if (i === 0) continue;
    const tx = i * pixelTickSpacing;
    const ty = 0;
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(0);
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(0, 5);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.translate(tx, ty);
    ctx.fillStyle = '#0f0';
    ctx.font = '8px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText((i * tickSpacing).toFixed(1), 0, -8);
    ctx.restore();
  }
  // 目盛り（Y軸）
  ctx.strokeStyle = '#00f';
  for (let i = -5; i <= 5; i++) {
    if (i === 0) continue;
    const tx = 0;
    const ty = -i * pixelTickSpacing;
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(-Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.lineTo(5, 0);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.translate(tx, ty);
    ctx.fillStyle = '#00f';
    ctx.font = '8px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText((i * tickSpacing).toFixed(1), 8, 0);
    ctx.restore();
  }
  ctx.restore();
}

const resetBtn = document.getElementById('resetBtn');
resetBtn.onclick = () => {
  if (confirm('本当に最初からやり直しますか？（未保存のデータは失われます）')) {
    window.location.reload();
  }
};

// Undoボタンのロジック
undoBtn.onclick = () => {
  if (!trackingMode) return;
  let frameData = trackingData.find(d => d.frame === currentFrame);
  if (frameData) {
    if (currentObjectIndex > 0) {
      frameData.positions[currentObjectIndex - 1] = null;
      currentObjectIndex--;
      drawOverlay();
      const intervalText = frameInterval === 1 ? '' : `（${frameInterval}フレームごと）`;
      updateGuideText(`物体${currentObjectIndex + 1}の位置をクリックしてください${intervalText}（${objectCount}物体）`, objectColors[currentObjectIndex % objectColors.length]);
      return;
    }
  }
  if (currentFrame > startFrame) {
    const prevFrame = Math.max(startFrame, currentFrame - frameInterval);
    currentFrame = prevFrame;
    video.currentTime = prevFrame / videoFps;
    const idx = trackingData.findIndex(d => d.frame === prevFrame);
    if (idx !== -1) {
      trackingData.splice(idx, 1);
      drawOverlay();
    }
    currentObjectIndex = 0;
    const intervalText = frameInterval === 1 ? '' : `（${frameInterval}フレームごと）`;
    updateGuideText(`物体1の位置をクリックしてください${intervalText}（${objectCount}物体）`, objectColors[0]);
  }
};

