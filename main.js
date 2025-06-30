// ファイル選択時に動画を読み込む
const videoInput = document.getElementById('videoInput');
const video = document.getElementById('video');
const canvas = document.getElementById('videoCanvas');
const fileNameSpan = document.getElementById('fileName');

let scaleLength = null; // スケールの実長（m）

const MAX_CANVAS_WIDTH = 660;
const MAX_CANVAS_HEIGHT = 480;

let fps = 30;
let startFrame = 0;
let endFrame = 0;
let totalFrames = 0;

const fpsInput = document.getElementById('fpsInput');
const startFrameInput = document.getElementById('startFrameInput');
const endFrameInput = document.getElementById('endFrameInput');
const currentFrameLabel = document.getElementById('currentFrameLabel');

let trackingMode = false;
let trackingData = []; // {frame, x, y}

const manualTrackBtn = document.getElementById('manualTrackBtn');
manualTrackBtn.onclick = () => {
  trackingMode = !trackingMode;
  if (trackingMode) {
    updateGuideText('物体の位置をクリックしてください（1点ごとにフレームが進みます）');
    manualTrackBtn.style.background = '#ffd';
  } else {
    updateGuideText('');
    manualTrackBtn.style.background = '';
  }
};

function resizeCanvasToFit() {
  // 親要素の幅、高さ、ウィンドウサイズを考慮してcanvasサイズを決定
  const container = document.querySelector('.video-container');
  const parentWidth = container.clientWidth;
  const parentHeight = window.innerHeight - container.getBoundingClientRect().top - 40; // 余白考慮
  let w = Math.min(MAX_CANVAS_WIDTH, parentWidth);
  let h = Math.min(MAX_CANVAS_HEIGHT, parentHeight);
  // 動画のアスペクト比を優先
  if (video.videoWidth && video.videoHeight) {
    const vr = video.videoWidth / video.videoHeight;
    if (w / h > vr) {
      w = h * vr;
    } else {
      h = w / vr;
    }
  }
  canvas.width = Math.round(w);
  canvas.height = Math.round(h);
}

videoInput.addEventListener('change', function() {
  const file = this.files[0];
  if (file) {
    const url = URL.createObjectURL(file);
    video.src = url;
    video.controls = false;
    fileNameSpan.textContent = file.name;
  }
});

// 再生・停止・フレーム送り/戻し（雛形）
document.getElementById('playBtn').onclick = () => video.play();
document.getElementById('pauseBtn').onclick = () => video.pause();

document.getElementById('nextFrameBtn').onclick = () => {
  video.pause();
  let frame = Math.round(video.currentTime * fps);
  if (frame < endFrame) {
    video.currentTime = (frame + 1) / fps;
    updateCurrentFrameLabel();
  }
};

document.getElementById('prevFrameBtn').onclick = () => {
  video.pause();
  let frame = Math.round(video.currentTime * fps);
  if (frame > startFrame) {
    video.currentTime = (frame - 1) / fps;
    updateCurrentFrameLabel();
  }
};

// --- スケール・原点・回転設定用 追加コード ---
let mode = null; // 'set-scale' | 'set-origin' | null
let scalePoints = [];
let originPoint = null;
let guideText = '';

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

function updateGuideText(text) {
  guideDiv.textContent = text || '';
}

// スケール設定ボタン
const setScaleBtn = document.getElementById('setScaleBtn');
setScaleBtn.onclick = () => {
  mode = 'set-scale';
  scalePoints = [];
  updateGuideText('スケール設定: 終点をクリックしてください');
  disableVideoControls(true);
};

// 原点設定ボタン
const setOriginBtn = document.getElementById('setOriginBtn');
setOriginBtn.onclick = () => {
  mode = 'set-origin';
  updateGuideText('原点設定: 原点となる点をクリックしてください');
  disableVideoControls(true);
};

// 物理座標変換（X:水平, Y:鉛直, Y成分の符号反転をやめる）
function getPhysicalCoords(canvasX, canvasY) {
  if (scalePoints.length < 2 || !scaleLength || !originPoint) return null;
  const [p0, p1] = scalePoints;
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const pixelDist = Math.sqrt(dx * dx + dy * dy);
  if (pixelDist === 0) return null;
  const theta = Math.atan2(dy, dx);
  const relX = canvasX - originPoint.x;
  const relY = canvasY - originPoint.y;
  const scale = scaleLength / pixelDist;
  const x_phys = ( Math.cos(theta) * relX + Math.sin(theta) * relY ) * scale;
  const y_phys = ( -Math.sin(theta) * relX + Math.cos(theta) * relY ) * scale;
  return { x: x_phys, y: y_phys };
}

// 物理→canvas座標（逆変換, Y成分の符号反転をやめる）
function physicalToCanvas(x_phys, y_phys) {
  if (scalePoints.length < 2 || !scaleLength || !originPoint) return null;
  const [p0, p1] = scalePoints;
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const pixelDist = Math.sqrt(dx * dx + dy * dy);
  if (pixelDist === 0) return null;
  const theta = Math.atan2(dy, dx);
  const scale = pixelDist / scaleLength;
  const x_rot = x_phys * scale;
  const y_rot = y_phys * scale;
  const relX = Math.cos(theta) * x_rot - Math.sin(theta) * y_rot;
  const relY = Math.sin(theta) * x_rot + Math.cos(theta) * y_rot;
  const x = originPoint.x + relX;
  const y = originPoint.y + relY;
  return { x: x, y: y };
}

// 動画のメタデータが読み込まれたらcanvasサイズを合わせる
video.addEventListener('loadedmetadata', function() {
  resizeCanvasToFit();
  fps = 30;
  fpsInput.value = fps;
  totalFrames = Math.floor(video.duration * fps);
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
  resizeCanvasToFit();
  drawOverlay();
});

let zoomFactor = 1.0;
let zoomOffsetX = 0;
let zoomOffsetY = 0;
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let dragOffsetStart = { x: 0, y: 0 };

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
  dragStart = { x: e.clientX, y: e.clientY };
  dragOffsetStart = { x: zoomOffsetX, y: zoomOffsetY };
});
window.addEventListener('mousemove', function(e) {
  if (isDragging) {
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    zoomOffsetX = dragOffsetStart.x + dx;
    zoomOffsetY = dragOffsetStart.y + dy;
    drawOverlay();
  }
});
window.addEventListener('mouseup', function() {
  isDragging = false;
});

// drawOverlay: zoomFactorとオフセットを反映
function drawOverlay() {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // アスペクト比維持で動画を中央に描画
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
    // ズーム・オフセットを反映
    ctx.save();
    ctx.translate(dx + dw / 2 + zoomOffsetX, dy + dh / 2 + zoomOffsetY);
    ctx.scale(zoomFactor, zoomFactor);
    ctx.drawImage(video, -dw / 2, -dh / 2, dw, dh);
    // スケール点
    ctx.fillStyle = 'blue';
    scalePoints.forEach(pt => {
      ctx.beginPath();
      ctx.arc(pt.x - cw / 2, pt.y - ch / 2, 7, 0, 2 * Math.PI);
      ctx.fill();
    });
    // 原点
    if (originPoint) {
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(originPoint.x - cw / 2, originPoint.y - ch / 2, 9, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(originPoint.x - 12 - cw / 2, originPoint.y - ch / 2);
      ctx.lineTo(originPoint.x + 12 - cw / 2, originPoint.y - ch / 2);
      ctx.moveTo(originPoint.x - cw / 2, originPoint.y - 12 - ch / 2);
      ctx.lineTo(originPoint.x - cw / 2, originPoint.y + 12 - ch / 2);
      ctx.stroke();
    }
    // 記録点（赤丸）
    ctx.fillStyle = 'red';
    trackingData.forEach(d => {
      const pt = physicalToCanvas(-d.y, -d.x);
      if (pt) {
        ctx.beginPath();
        ctx.arc(pt.x - cw / 2, pt.y - ch / 2, 3, 0, 2 * Math.PI);
        ctx.fill();
      }
    });
    
    // 座標軸を描画
    drawCoordinateAxes(ctx, cw, ch);
    
    ctx.restore();
  }
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

  if (trackingMode) {
    const phys = getPhysicalCoords(x, y);
    const frame = Math.round(video.currentTime * fps);
    console.log('trackingModeクリック:', {x, y, phys, frame});
    if (phys) {
      // trackingDataへの保存時のみ、xとyを逆転し、両方とも符号を反転して保存
      trackingData.push({ frame, x: -phys.y, y: -phys.x });
      console.log('trackingData:', trackingData);
      
      // デバッグ: 逆変換で位置を確認
      const backToCanvas = physicalToCanvas(phys.x, phys.y);
      console.log('逆変換確認:', {original: {x, y}, backToCanvas, diff: {
        x: Math.abs(x - backToCanvas.x),
        y: Math.abs(y - backToCanvas.y)
      }});
      
      drawOverlay();
      // 1フレーム進める
      video.currentTime += 1 / fps;
      updateCurrentFrameLabel();
      console.log('video.currentTime:', video.currentTime);
    } else {
      alert('スケール・原点・スケール長が未設定です');
    }
    return;
  }

  if (mode) {
    // そのままcanvas座標として記録
    if (mode === 'set-scale') {
      scalePoints.push({ x, y });
      console.log('スケール点追加:', {x, y}, '現在のスケール点:', scalePoints);
      drawOverlay(); // まず青マーカーを描画
      if (scalePoints.length === 2) {
        setTimeout(() => {
          const len = prompt('2点間の実際の長さをメートル単位で入力してください');
          if (len && !isNaN(len)) {
            scaleLength = parseFloat(len);
            console.log('スケール長設定:', scaleLength);
          } else {
            scaleLength = null;
            alert('有効な数値を入力してください');
          }
          mode = null;
          updateGuideText('');
          disableVideoControls(false);
        }, 50); // 描画後にpromptを出す
      } else {
        updateGuideText('スケール設定: 終点をクリックしてください');
      }
      return;
    } else if (mode === 'set-origin') {
      originPoint = { x, y };
      console.log('原点設定:', {x, y});
      mode = null;
      updateGuideText('');
      disableVideoControls(false);
    }
    drawOverlay();
    return;
  }

  // デバッグ: 物理座標変換
  const phys = getPhysicalCoords(x, y);
  if (phys) {
    console.log('物理座標:', phys);
    // 逆変換で位置を確認
    const backToCanvas = physicalToCanvas(phys.x, phys.y);
    console.log('逆変換確認:', {original: {x, y}, backToCanvas, diff: {
      x: Math.abs(x - backToCanvas.x),
      y: Math.abs(y - backToCanvas.y)
    }});
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

// fps入力欄の変更を反映
fpsInput.addEventListener('change', function() {
  fps = parseInt(fpsInput.value) || 30;
  totalFrames = Math.floor(video.duration * fps);
  // 解析範囲も再設定
  endFrame = totalFrames - 1;
  endFrameInput.value = endFrame;
  updateCurrentFrameLabel();
});

// 解析開始・終了フレーム入力欄の変更を反映
startFrameInput.addEventListener('change', function() {
  startFrame = parseInt(startFrameInput.value) || 0;
  frameSlider.min = startFrame;
  updateCurrentFrameLabel();
});
endFrameInput.addEventListener('change', function() {
  endFrame = parseInt(endFrameInput.value) || (totalFrames - 1);
  frameSlider.max = endFrame;
  updateCurrentFrameLabel();
});

// 現在のフレーム番号を表示
function updateCurrentFrameLabel() {
  const frame = Math.round(video.currentTime * fps);
  currentFrameLabel.textContent = `現在フレーム: ${frame}`;
}

// フレーム送り/戻し時や動画シーク時に現在フレーム表示を更新
video.addEventListener('seeked', updateCurrentFrameLabel);
video.addEventListener('timeupdate', function() {
  const frame = Math.round(video.currentTime * fps);
  frameSlider.value = frame;
  updateCurrentFrameLabel();
  if (frame >= endFrame) {
    video.pause();
    video.currentTime = endFrame / fps;
    updateCurrentFrameLabel();
  }
});

// スライダーと動画の同期
const frameSlider = document.getElementById('frameSlider');

// スライダー操作で動画のcurrentTimeを変更
frameSlider.addEventListener('input', function() {
  const frame = parseInt(frameSlider.value) || 0;
  video.currentTime = frame / fps;
  updateCurrentFrameLabel();
});

// 動画の再生位置が変わったらスライダーも追従
video.addEventListener('seeked', function() {
  const frame = Math.round(video.currentTime * fps);
  frameSlider.value = frame;
  updateCurrentFrameLabel();
});
video.addEventListener('timeupdate', function() {
  const frame = Math.round(video.currentTime * fps);
  frameSlider.value = frame;
  updateCurrentFrameLabel();
});

const exportCsvBtn = document.getElementById('exportCsvBtn');
exportCsvBtn.onclick = () => {
  if (!trackingData.length) {
    alert('記録データがありません');
    return;
  }
  let csv = 'time(s),x(m),y(m)\n';
  trackingData.forEach(d => {
    const t = ((d.frame - startFrame) / fps).toFixed(6);
    // 物理座標変換と一貫性を保つ（XとYの入れ替えなし）
    csv += `${t},${d.x},${d.y}\n`;
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

// 座標軸をスケール線の回転を反映して描画（X:鉛直, Y:水平, 正負方向に目盛り）
function drawCoordinateAxes(ctx, cw, ch) {
  if (!originPoint || scalePoints.length < 2 || !scaleLength) return;
  ctx.save();
  ctx.globalAlpha = 0.4;
  const [p0, p1] = scalePoints;
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const pixelDist = Math.sqrt(dx * dx + dy * dy);
  const theta = Math.atan2(dy, dx);
  const axisLength = Math.min(cw, ch) * 0.25;
  // Y軸（青, 水平, スケール線の回転を反映）
  ctx.strokeStyle = '#00f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(originPoint.x - cw / 2 - axisLength * Math.cos(theta), originPoint.y - ch / 2 - axisLength * Math.sin(theta));
  ctx.lineTo(originPoint.x - cw / 2 + axisLength * Math.cos(theta), originPoint.y - ch / 2 + axisLength * Math.sin(theta));
  ctx.stroke();
  // Y軸矢印
  ctx.beginPath();
  const arrowY = originPoint.x - cw / 2 + axisLength * Math.cos(theta);
  const arrowYy = originPoint.y - ch / 2 + axisLength * Math.sin(theta);
  ctx.moveTo(arrowY, arrowYy);
  ctx.lineTo(arrowY - 10 * Math.cos(theta) - 6 * Math.sin(theta), arrowYy - 10 * Math.sin(theta) + 6 * Math.cos(theta));
  ctx.moveTo(arrowY, arrowYy);
  ctx.lineTo(arrowY - 10 * Math.cos(theta) + 6 * Math.sin(theta), arrowYy - 10 * Math.sin(theta) - 6 * Math.cos(theta));
  ctx.stroke();
  // X軸（緑, 鉛直, スケール線の回転を反映）
  ctx.strokeStyle = '#0f0';
  ctx.beginPath();
  ctx.moveTo(originPoint.x - cw / 2 - axisLength * Math.sin(theta), originPoint.y - ch / 2 + axisLength * Math.cos(theta));
  ctx.lineTo(originPoint.x - cw / 2 + axisLength * Math.sin(theta), originPoint.y - ch / 2 - axisLength * Math.cos(theta));
  ctx.stroke();
  // X軸矢印
  ctx.beginPath();
  const arrowX = originPoint.x - cw / 2 + axisLength * Math.sin(theta);
  const arrowXy = originPoint.y - ch / 2 - axisLength * Math.cos(theta);
  ctx.moveTo(arrowX, arrowXy);
  ctx.lineTo(arrowX - 6 * Math.sin(theta) + 10 * Math.cos(theta), arrowXy + 6 * Math.cos(theta) + 10 * Math.sin(theta));
  ctx.moveTo(arrowX, arrowXy);
  ctx.lineTo(arrowX + 6 * Math.sin(theta) + 10 * Math.cos(theta), arrowXy - 6 * Math.cos(theta) + 10 * Math.sin(theta));
  ctx.stroke();
  // ラベル
  ctx.fillStyle = '#0f0';
  ctx.font = '14px Arial';
  ctx.fillText('X', originPoint.x - cw / 2 + (axisLength + 15) * Math.sin(theta), originPoint.y - ch / 2 - (axisLength + 15) * Math.cos(theta));
  ctx.fillStyle = '#00f';
  ctx.fillText('Y', originPoint.x - cw / 2 + (axisLength + 15) * Math.cos(theta), originPoint.y - ch / 2 + (axisLength + 15) * Math.sin(theta));
  // 目盛り（Y軸正負方向）
  const scale = scaleLength / pixelDist;
  const tickSpacing = scaleLength / 10;
  const pixelTickSpacing = tickSpacing / scale;
  ctx.strokeStyle = '#00f';
  ctx.lineWidth = 1;
  for (let i = -5; i <= 5; i++) {
    if (i === 0) continue;
    const tx = originPoint.x - cw / 2 + i * pixelTickSpacing * Math.cos(theta);
    const ty = originPoint.y - ch / 2 + i * pixelTickSpacing * Math.sin(theta);
    ctx.beginPath();
    ctx.moveTo(tx - 5 * Math.sin(theta), ty + 5 * Math.cos(theta));
    ctx.lineTo(tx + 5 * Math.sin(theta), ty - 5 * Math.cos(theta));
    ctx.stroke();
    ctx.fillStyle = '#00f';
    ctx.font = '10px Arial';
    ctx.fillText(((-i) * tickSpacing).toFixed(1), tx + 8 * Math.cos(theta), ty + 8 * Math.sin(theta));
  }
  // X軸正負方向の目盛り
  ctx.strokeStyle = '#0f0';
  for (let i = -5; i <= 5; i++) {
    if (i === 0) continue;
    const tx = originPoint.x - cw / 2 + i * pixelTickSpacing * Math.sin(theta);
    const ty = originPoint.y - ch / 2 - i * pixelTickSpacing * Math.cos(theta);
    ctx.beginPath();
    ctx.moveTo(tx - 5 * Math.cos(theta), ty - 5 * Math.sin(theta));
    ctx.lineTo(tx + 5 * Math.cos(theta), ty + 5 * Math.sin(theta));
    ctx.stroke();
    ctx.fillStyle = '#0f0';
    ctx.font = '10px Arial';
    ctx.fillText((i * tickSpacing).toFixed(1), tx - 8 * Math.sin(theta), ty + 8 * Math.cos(theta));
  }
  ctx.restore();
}

