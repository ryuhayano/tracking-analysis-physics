// 基本的な動作確認
console.log('main.js 読み込み完了');

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
  console.log('ファイル選択イベント発生');
  const file = this.files[0];
  if (file) {
    console.log('動画ファイル選択:', file.name, file.size);
    const url = URL.createObjectURL(file);
    video.src = url;
    video.controls = false;
    fileNameSpan.textContent = file.name;
  } else {
    console.log('ファイルが選択されていません');
  }
});

// 再生・停止・フレーム送り/戻し
document.getElementById('playBtn').onclick = () => {
  console.log('再生ボタンクリック');
  video.play();
};
document.getElementById('pauseBtn').onclick = () => {
  console.log('停止ボタンクリック');
  video.pause();
};

document.getElementById('nextFrameBtn').onclick = () => {
  video.pause();
  let frame = Math.round(video.currentTime * fps);
  if (frame < endFrame) {
    video.currentTime = (frame + 1) / fps;
    updateCurrentFrameLabel();
    drawOverlay();
  }
};

document.getElementById('prevFrameBtn').onclick = () => {
  video.pause();
  let frame = Math.round(video.currentTime * fps);
  if (frame > startFrame) {
    video.currentTime = (frame - 1) / fps;
    updateCurrentFrameLabel();
    drawOverlay();
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
  updateGuideText('スケール設定: 始点と終点をクリックしてください');
  disableVideoControls(true);
};

// 原点設定ボタン
const setOriginBtn = document.getElementById('setOriginBtn');
setOriginBtn.onclick = () => {
  mode = 'set-origin';
  updateGuideText('原点設定: 原点となる点をクリックしてください');
  disableVideoControls(true);
};

// ===== 座標変換システム =====
// 座標系の定義:
// - Canvas座標: 左上が(0,0)、右が+X、下が+Y
// - 物理座標: 原点を中心、右が+X、下が+Y（重力方向が正）
// - スケール線: 始点から終点の方向が物理座標の+X軸方向

/**
 * Canvas座標を物理座標に変換
 * @param {number} canvasX - Canvas上のX座標（ピクセル）
 * @param {number} canvasY - Canvas上のY座標（ピクセル）
 * @returns {Object|null} 物理座標 {x, y}（メートル）、変換できない場合はnull
 */
function getPhysicalCoords(canvasX, canvasY) {
  // スケール・原点が設定されていない場合は変換不可
  if (scalePoints.length < 2 || !scaleLength || !originPoint) return null;
  
  const [p0, p1] = scalePoints;
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const pixelDist = Math.sqrt(dx * dx + dy * dy);
  if (pixelDist === 0) return null;
  
  // スケール線の角度（物理座標の+X軸方向）
  const theta = Math.atan2(dy, dx);
  
  // 原点からの相対座標
  const relX = canvasX - originPoint.x;
  const relY = canvasY - originPoint.y;
  
  // ピクセル→メートルの変換スケール
  const scale = scaleLength / pixelDist;
  
  // 座標変換: 回転してスケール適用
  // 物理座標系: スケール線方向が+X、その垂直方向が+Y
  const x_phys = (Math.cos(theta) * relX + Math.sin(theta) * relY) * scale;
  const y_phys = (-Math.sin(theta) * relX + Math.cos(theta) * relY) * scale;
  
  return { x: x_phys, y: y_phys };
}

/**
 * 物理座標をCanvas座標に変換（逆変換）
 * @param {number} x_phys - 物理座標X（メートル）
 * @param {number} y_phys - 物理座標Y（メートル）
 * @returns {Object|null} Canvas座標 {x, y}（ピクセル）、変換できない場合はnull
 */
function physicalToCanvas(x_phys, y_phys) {
  // スケール・原点が設定されていない場合は変換不可
  if (scalePoints.length < 2 || !scaleLength || !originPoint) return null;
  
  const [p0, p1] = scalePoints;
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const pixelDist = Math.sqrt(dx * dx + dy * dy);
  if (pixelDist === 0) return null;
  
  // スケール線の角度（物理座標の+X軸方向）
  const theta = Math.atan2(dy, dx);
  
  // メートル→ピクセルの変換スケール
  const scale = pixelDist / scaleLength;
  
  // スケール適用
  const x_rot = x_phys * scale;
  const y_rot = y_phys * scale;
  
  // 逆回転変換
  const relX = Math.cos(theta) * x_rot - Math.sin(theta) * y_rot;
  const relY = Math.sin(theta) * x_rot + Math.cos(theta) * y_rot;
  
  // 原点を加算してCanvas座標に変換
  const x = originPoint.x + relX;
  const y = originPoint.y + relY;
  
  return { x: x, y: y };
}

// 動画のメタデータが読み込まれたらcanvasサイズを合わせる
video.addEventListener('loadedmetadata', function() {
  console.log('動画メタデータ読み込み完了:', {
    width: video.videoWidth,
    height: video.videoHeight,
    duration: video.duration
  });
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
  console.log('ズームイン ボタンクリック');
  zoomFactor = Math.min(zoomFactor * 1.25, 10);
  updateZoomLabel();
  drawOverlay();
};
zoomOutBtn.onclick = () => {
  console.log('ズームアウト ボタンクリック');
  zoomFactor = Math.max(zoomFactor / 1.25, 0.1);
  updateZoomLabel();
  drawOverlay();
};
zoomResetBtn.onclick = () => {
  console.log('ズームリセット ボタンクリック');
  zoomFactor = 1.0;
  zoomOffsetX = 0;
  zoomOffsetY = 0;
  updateZoomLabel();
  drawOverlay();
};

updateZoomLabel();

// video要素は常に非表示
video.style.display = 'none';

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

// canvasクリック時の座標取得をgetCanvasCoordsに変更
canvas.addEventListener('click', function(e) {
  const { x, y } = getCanvasCoords(e);

  if (trackingMode) {
    const phys = getPhysicalCoords(x, y);
    const frame = Math.round(video.currentTime * fps);
    console.log('trackingModeクリック:', {x, y, phys, frame});
    if (phys) {
      trackingData.push({ frame, x: phys.x, y: phys.y });
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
            // スケール設定完了時に座標軸を表示
            drawOverlay();
          } else {
            scaleLength = null;
            alert('有効な数値を入力してください');
          }
          mode = null;
          updateGuideText('');
          disableVideoControls(false);
        }, 50); // 描画後にpromptを出す
      } else {
        updateGuideText('スケール設定: 2点目（終点）をクリックしてください');
      }
      return;
    } else if (mode === 'set-origin') {
      originPoint = { x, y };
      console.log('原点設定:', {x, y});
      mode = null;
      updateGuideText('');
      disableVideoControls(false);
      // 原点設定完了時に座標軸を表示（スケールも設定済みの場合）
      drawOverlay();
    }
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

// Canvasに動画フレームを描画
video.addEventListener('play', function() {
  console.log('動画再生開始');
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

// 動画の時間更新時の処理
video.addEventListener('timeupdate', function() {
  const frame = Math.round(video.currentTime * fps);
  frameSlider.value = frame;
  updateCurrentFrameLabel();
  // 終了フレームに到達したら一時停止（強制設定は削除）
  if (frame >= endFrame && !video.paused) {
    video.pause();
  }
});

// スライダーと動画の同期
const frameSlider = document.getElementById('frameSlider');

// スライダー操作で動画のcurrentTimeを変更
frameSlider.addEventListener('input', function() {
  const frame = parseInt(frameSlider.value) || 0;
  // 範囲チェック
  if (frame >= startFrame && frame <= endFrame) {
    video.currentTime = frame / fps;
    updateCurrentFrameLabel();
    // スライダー操作時は即座に画面を更新
    drawOverlay();
  }
});

// 動画の再生位置が変わったらスライダーも追従
video.addEventListener('seeked', function() {
  const frame = Math.round(video.currentTime * fps);
  // 範囲内の場合のみスライダーを更新
  if (frame >= startFrame && frame <= endFrame) {
    frameSlider.value = frame;
  }
  updateCurrentFrameLabel();
  // シーク時も画面を更新
  drawOverlay();
});

// CSV出力機能
const exportCsvBtn = document.getElementById('exportCsvBtn');
exportCsvBtn.onclick = () => {
  if (!trackingData.length) {
    alert('記録データがありません');
    return;
  }
  
  // CSVヘッダー: 時間(秒), X座標(メートル), Y座標(メートル)
  let csv = 'time(s),x(m),y(m)\n';
  
  trackingData.forEach(d => {
    const t = ((d.frame - startFrame) / fps).toFixed(6);
    // xとyを入れ替え、符号を反転
    csv += `${t},${-d.y},${-d.x}\n`;
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
 * 座標軸を描画（スケール線の回転を反映）
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
  const theta = Math.atan2(dy, dx); // スケール線の角度
  let axisLength = Math.min(cw, ch) * 0.25;

  // Y軸の上端がcanvas外に出る場合は短くする
  const yAxisEndX = originPoint.x - cw / 2 + axisLength * Math.cos(theta);
  const yAxisEndY = originPoint.y - ch / 2 + axisLength * Math.sin(theta);
  const yAxisStartX = originPoint.x - cw / 2 - axisLength * Math.cos(theta);
  const yAxisStartY = originPoint.y - ch / 2 - axisLength * Math.sin(theta);
  if (yAxisStartY < -ch / 2 + 10) {
    const available = (originPoint.y - 10) - 0;
    axisLength = Math.min(axisLength, available / Math.abs(Math.sin(theta)));
  }

  // Y軸（スケール線の方向）
  ctx.strokeStyle = '#00f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(originPoint.x - cw / 2 - axisLength * Math.cos(theta), originPoint.y - ch / 2 - axisLength * Math.sin(theta));
  ctx.lineTo(originPoint.x - cw / 2 + axisLength * Math.cos(theta), originPoint.y - ch / 2 + axisLength * Math.sin(theta));
  ctx.stroke();

  // Y軸矢印（常に画面上方向＝theta-π/2で回転）
  const arrowYx = originPoint.x - cw / 2 - axisLength * Math.cos(theta);
  const arrowYy = originPoint.y - ch / 2 - axisLength * Math.sin(theta);
  ctx.save();
  ctx.translate(arrowYx, arrowYy);
  ctx.rotate(theta - Math.PI / 2);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-6, 15);
  ctx.moveTo(0, 0);
  ctx.lineTo(6, 15);
  ctx.stroke();
  ctx.restore();

  // X軸（スケール線の法線方向）
  ctx.strokeStyle = '#0f0';
  ctx.beginPath();
  ctx.moveTo(originPoint.x - cw / 2 - axisLength * Math.sin(theta), originPoint.y - ch / 2 + axisLength * Math.cos(theta));
  ctx.lineTo(originPoint.x - cw / 2 + axisLength * Math.sin(theta), originPoint.y - ch / 2 - axisLength * Math.cos(theta));
  ctx.stroke();

  // X軸矢印（画面右方向＝thetaで回転）
  const arrowXx = originPoint.x - cw / 2 + axisLength * Math.sin(theta);
  const arrowXy = originPoint.y - ch / 2 - axisLength * Math.cos(theta);
  ctx.save();
  ctx.translate(arrowXx, arrowXy);
  ctx.rotate(theta);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-6, 15);
  ctx.moveTo(0, 0);
  ctx.lineTo(6, 15);
  ctx.stroke();
  ctx.restore();

  // 軸ラベル
  ctx.save();
  ctx.font = '14px Arial';
  // Xラベル
  ctx.fillStyle = '#0f0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.save();
  ctx.translate(originPoint.x - cw / 2 + (axisLength + 18) * Math.sin(theta), originPoint.y - ch / 2 - (axisLength + 18) * Math.cos(theta));
  ctx.fillText('X', 0, 0);
  ctx.restore();
  // Yラベル
  ctx.fillStyle = '#00f';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.translate(originPoint.x - cw / 2 - (axisLength + 18) * Math.cos(theta), originPoint.y - ch / 2 - (axisLength + 18) * Math.sin(theta));
  ctx.fillText('Y', 0, 0);
  ctx.restore();
  ctx.restore();

  // 目盛り（Y軸）
  const scale = scaleLength / pixelDist;
  const tickSpacing = scaleLength / 10;
  const pixelTickSpacing = tickSpacing / scale;
  ctx.strokeStyle = '#00f';
  ctx.lineWidth = 1;
  for (let i = -5; i <= 5; i++) {
    if (i === 0) continue;
    const tx = originPoint.x - cw / 2 + i * pixelTickSpacing * Math.cos(theta);
    const ty = originPoint.y - ch / 2 + i * pixelTickSpacing * Math.sin(theta);
    // tick mark
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(theta + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.lineTo(5, 0);
    ctx.stroke();
    ctx.restore();
    // ラベル（画面に対して水平）
    ctx.save();
    ctx.translate(tx, ty);
    ctx.fillStyle = '#00f';
    ctx.font = '8px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText((-i * tickSpacing).toFixed(1), 8, 0);
    ctx.restore();
  }

  // 目盛り（X軸）
  ctx.strokeStyle = '#0f0';
  for (let i = -5; i <= 5; i++) {
    if (i === 0) continue;
    const tx = originPoint.x - cw / 2 + i * pixelTickSpacing * Math.sin(theta);
    const ty = originPoint.y - ch / 2 - i * pixelTickSpacing * Math.cos(theta);
    // tick mark
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(theta);
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(0, 5);
    ctx.stroke();
    ctx.restore();
    // ラベル（画面に対して水平）
    ctx.save();
    ctx.translate(tx, ty);
    ctx.fillStyle = '#0f0';
    ctx.font = '8px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText((i * tickSpacing).toFixed(1), 0, -8);
    ctx.restore();
  }

  ctx.restore();
}