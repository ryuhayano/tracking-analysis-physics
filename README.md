# Physics Exam Lab – 物体位置トラッキング用ソフトウェア  
（Tracking Analysis Software for Physics Education）

このソフトウェアは、動画に映る物体の位置を時刻ごとにデジタル化し、(t, x, y) などのデータを得ることで、物理現象の定量的解析を支援します。  
たとえば、落下運動・放物運動・衝突などの動画から、座標や速度・加速度を求めることができます。

## 目的と背景

このソフトは、「Physics Exam Lab」ブランドの教材の一部として、教室での物理実験を支援するために開発されました。  
大学入試問題（共通テストや東大入試など）に出題された内容を題材とし、実際に手を動かして再現・解析できる環境を提供することを目的としています。

> This web application enables analysis of real-world physics phenomena using entrance exam problems as motivation, aiming to revitalize experimental instruction in high school physics classrooms.

## 使用技術

- HTML / CSS / JavaScript（Webブラウザ上で動作、インストール不要）
- モダンなブラウザ（Chrome, Edge, Firefox, Safariなど）で利用可能
- スマートフォンやタブレットでも基本機能は使用可能（ただし画面サイズ推奨）

## デモ・ソースコード

- GitHub: [https://github.com/ryuhayano/tracking-analysis-physics](https://github.com/ryuhayano/tracking-analysis-physics)

## ライセンス

このソフトウェアは、非営利利用に限り改変・再配布などが自由に行える  
[Creative Commons 表示-非営利 4.0 国際ライセンス（CC BY-NC 4.0）](https://creativecommons.org/licenses/by-nc/4.0/deed.ja) のもとで公開されています。

### 許可される利用

- 教室での授業、学校内での教材活用
- 学会・研究会での発表、学術研究での利用
- 個人学習・教育目的での利用
- ソースコードの改変・カスタマイズ（非営利目的）

### 禁止される利用

- 商用利用（有料教材への組み込み、営利講座での配布等）
- 著作権表示の削除や独自販売
- 営利目的での再配布

Licensed under the Creative Commons Attribution-NonCommercial 4.0 International License.  
You may share and adapt the code for non-commercial educational use, with proper credit to the original authors.  

完全なライセンス条文については、[LICENSE](./LICENSE) ファイルをご参照ください。

### 著作権表示

© 2025 一般社団法人 国際物理オリンピック2023記念協会  
The IPhO2023 Commemorative Association  
https://ipho2023-commemorative-association.jp/

## 免責事項

このソフトウェアは、現状のまま（"as is"）提供されています。  
動作保証やサポートはありませんので、ご自身の責任でご使用ください。

> This software is provided "as is", without warranty of any kind. Use at your own risk.

## 最新の更新（2025年1月30日）

- **クイックガイド機能追加**: 現在の進捗を視覚的に表示する5ステップの進捗管理機能
  - ファイル選択、原点設定、スケール設定、追跡開始、データ出力の5ステップ
  - 未完了（青）、現在（黄）、完了（緑）の色分け表示
  - 初心者でも迷わずに操作できる直感的なガイド
- **サンプル動画読み込み時の改善**: FPS自動設定（120fps）とダイアログスキップ機能
  - サンプル動画を読み込むと自動的に120fpsに設定
  - FPS入力ダイアログが表示されず、スムーズに操作開始可能

## 前回の更新（2025年1月）

- **UIレイアウトの大幅改善**: UIを左側、動画を右側に配置する新しいレイアウトに変更
- **動画表示エリアの最大化**: 動画がより大きく表示され、解析作業が効率化
- **レスポンシブデザインの強化**: MacBook Pro、iPad Proなど様々なデバイスでの最適化
- **ファイル名表示の改善**: 選択したファイル名が視認性良く表示
- **CSV出力方式の改善**: ファイルダウンロードから画面からのコピー方式に変更（iPad Safari対応）
- **データ形式選択**: Excel用タブ区切りまたはCSV形式を選択可能
- **iPad Safari対応**: ファイルダウンロードが困難な環境でもデータ取得が可能

## 詳細な使い方

詳しい操作方法や機能説明については、以下のファイルをご参照ください：

- **MANUAL.txt**: 詳細な機能説明・使用手順・バージョン履歴
- **USAGE_GUIDE.html**: 画像付きステップバイステップガイド
