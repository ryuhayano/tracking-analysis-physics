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
let trackingData = []; // [{frame, positions: [{x, y}, ...]}]
let currentObjectIndex = 0; // 今どの物体のクリック待ちか

// 物体ごとの色（最大2個、拡張可）
const objectColors = ['magenta', 'orange', 'cyan', 'lime', 'purple', 'brown'];

// --- 物体数・追跡開始ボタン ---
const objectCountSelect = document.getElementById('objectCountSelect');
const startTrackingBtn = document.getElementById('startTrackingBtn');
let objectCount = 1;
objectCountSelect.addEventListener('change', () => {
  objectCount = parseInt(objectCountSelect.value) || 1;
});
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
    updateGuideText(`物体${objectCount === 1 ? '' : '1'}の位置をクリックしてください（${objectCount}物体）`, objectColors[0]);
    startTrackingBtn.style.background = '#ffd';
    objectCountSelect.disabled = true;
  } else {
    endTrackingMode();
  }
  updateUndoBtnVisibility();
};

function resizeCanvasToFit() {
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
      w = h * aspect;
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
    fileNameSpan.textContent = file.name;
    
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
  let frame = Math.round(video.currentTime * fps);
  if (frame < endFrame) {
    video.currentTime = (frame + 1) / fps;
    updateCurrentFrameLabel();
  }
};

// 1フレーム戻るボタンの拡張
const prevFrameBtn = document.getElementById('prevFrameBtn');
const origPrevFrameOnClick = prevFrameBtn.onclick;
prevFrameBtn.onclick = () => {
  if (trackingMode) {
    // trackingDataからこのフレームのデータを消す
    const frame = Math.round(video.currentTime * fps);
    const idx = trackingData.findIndex(d => d.frame === frame);
    if (idx !== -1) {
      trackingData.splice(idx, 1);
      drawOverlay();
    }
    // 物体1から再入力
    currentObjectIndex = 0;
    updateGuideText(`物体1の位置をクリックしてください（${objectCount}物体）`, objectColors[0]);
  }
  // 通常の1フレーム戻る動作
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
console.log('zoomInBtn:', zoomInBtn, 'zoomOutBtn:', zoomOutBtn, 'zoomResetBtn:', zoomResetBtn);
const zoomLevelLabel = document.getElementById('zoomLevelLabel');

function updateZoomLabel() {
  zoomLevelLabel.textContent = `x${zoomFactor.toFixed(2)}`;
}

zoomInBtn.onclick = () => {
  console.log('zoom in clicked');
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
    const frame = Math.round(video.currentTime * fps);
    if (phys) {
      // 解析終了フレーム以降は追跡モード自動終了
      if (frame > endFrame) {
        endTrackingMode();
        return;
      }
      // trackingDataのframeを検索
      let frameData = trackingData.find(d => d.frame === frame);
      if (!frameData) {
        frameData = { frame, positions: Array(objectCount).fill(null) };
        trackingData.push(frameData);
      }
      // 物体ごとの座標を記録（符号反転・入れ替えせずそのまま保存）
      frameData.positions[currentObjectIndex] = { x: phys.x, y: phys.y };
      drawOverlay();
      updateUndoBtnVisibility();
      // 次の物体へ
      currentObjectIndex++;
      if (currentObjectIndex >= objectCount) {
        // 全物体分クリック済み→次フレームへ
        currentObjectIndex = 0;
        video.currentTime += 1 / fps;
        updateCurrentFrameLabel();
        updateUndoBtnVisibility();
      }
      // ガイドテキスト更新（色も物体色に）
      if (trackingMode) {
        if (Math.round(video.currentTime * fps) > endFrame) {
          endTrackingMode();
        } else {
          updateGuideText(`物体${currentObjectIndex + 1}の位置をクリックしてください（${objectCount}物体）`, objectColors[currentObjectIndex % objectColors.length]);
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
    ctx.arc(pt.x - canvas.width/2, pt.y - canvas.height/2, 5, 0, 2 * Math.PI);
    ctx.fill();
  });
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
          const len = prompt('2点間の実際の長さをメートル単位で入力してください');
          if (len && !isNaN(len)) {
            scaleLength = parseFloat(len);
            drawOverlay(); // スケール設定完了時に座標軸を表示
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
      mode = null;
      updateGuideText('');
      disableVideoControls(false);
      drawOverlay(); // 原点設定完了時に座標軸を表示
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
  // 終了フレームに到達したら一時停止のみ（巻き戻しやスライダー操作は妨げない）
  if (frame >= endFrame && !video.paused) {
    video.pause();
    // currentTimeをendFrameに強制セット
    video.currentTime = endFrame / fps;
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
  // 終了フレームに到達したら一時停止のみ（巻き戻しやスライダー操作は妨げない）
  if (frame >= endFrame && !video.paused) {
    video.pause();
    // currentTimeをendFrameに強制セット
    video.currentTime = endFrame / fps;
  }
});

const exportCsvBtn = document.getElementById('exportCsvBtn');
exportCsvBtn.onclick = () => {
  if (!trackingData.length) {
    alert('記録データがありません');
    return;
  }
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
          // 水平スケール線: x=+y, y=+x（どちらも正符号）
          row.push(pos.y.toFixed(3), pos.x.toFixed(3));
        } else {
          // 鉛直スケール線: 通常通り（X:右、Y:上、Yのみ符号反転）
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
  const frame = Math.round(video.currentTime * fps);
  // 直前の点を消す
  let frameData = trackingData.find(d => d.frame === frame);
  if (frameData) {
    // まだ全物体分打ち終わっていない場合
    if (currentObjectIndex > 0) {
      frameData.positions[currentObjectIndex - 1] = null;
      currentObjectIndex--;
      drawOverlay();
      updateGuideText(`物体${currentObjectIndex + 1}の位置をクリックしてください（${objectCount}物体）`, objectColors[currentObjectIndex % objectColors.length]);
      return;
    }
  }
  // すでに全物体分打ち終わっている場合 or このフレームのデータがない場合
  // 1フレーム戻る相当のundo
  if (frame > startFrame) {
    video.currentTime = (frame - 1) / fps;
    // そのフレームのデータも消す
    const prevFrame = frame - 1;
    const idx = trackingData.findIndex(d => d.frame === prevFrame);
    if (idx !== -1) {
      trackingData.splice(idx, 1);
      drawOverlay();
    }
    // 物体1から再入力
    currentObjectIndex = 0;
    updateGuideText(`物体1の位置をクリックしてください（${objectCount}物体）`, objectColors[0]);
  }
};

