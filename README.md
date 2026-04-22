<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# AeroGrid 3D

**リアルタイム3Dグローブ上で航空機・衛星・気象レーダーを可視化するWebアプリ**

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript)
![deck.gl](https://img.shields.io/badge/deck.gl-9.3-FF6B6B)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss)

</div>

## 概要

AeroGrid 3D は、インタラクティブな3Dグローブ上でリアルタイムの航空トラフィック・衛星位置・気象レーダーを同時表示するビジュアライゼーションアプリケーションです。

- **ライブモード**: OpenSky Network API から約20秒ごとに飛行データを取得
- **シミュレーションモード**: APIが利用不可の場合、自動的にシミュレーションデータにフォールバック

## 主な機能

### 航空機トラッキング
- 3,000機以上のリアルタイム航空機をカテゴリ別3Dモデルで表示
- フライトトレイル（位置履歴）の可視化
- カラーモード：高度 / 速度 / 機体カテゴリ
- 地上機の非表示フィルター

### 衛星トラッキング
- NORAD TLEデータ + SGP4軌道伝播による衛星位置のリアルタイム計算
- カテゴリ: 宇宙ステーション (ISS)・Starlink・GPS・気象・可視衛星
- TLEデータは30分ごとに CelesTrak から更新

### 3D可視化
- **表示モード**: 3Dグローブ / フラットマップ の切り替え
- **マップスタイル**: ダーク / ライト / 衛星写真
- 昼/夜モード切り替え
- 気象レーダーオーバーレイ (RainViewer API、10分ごと更新)
- 100以上の主要空港マーカー

### 検索 & 情報パネル
- コールサイン・ICAO IDによるフライト検索、衛星名検索
- 選択オブジェクトの詳細情報（高度・速度・方位・軌道周期など）
- カメラ追跡機能

## スクリーンショット

> 左サイドバーでレイヤーとカラーモードを切り替え、上部バーでリアルタイム統計を確認できます。

## 技術スタック

| カテゴリ | ライブラリ |
|---|---|
| フレームワーク | React 19, TypeScript 5.8, Vite 6 |
| 3D描画 | deck.gl 9.3 (ScenegraphLayer, TileLayer 等) |
| 衛星軌道計算 | satellite.js 4.1 (SGP4/TLE) |
| スタイリング | Tailwind CSS 4, Motion (Framer Motion) |
| アイコン | Lucide React |
| 数値演算 | math.gl 4.1 |

## セットアップ

**前提条件**: Node.js 18以上

```bash
# 依存関係のインストール
npm install

# 開発サーバーの起動
npm run dev
```

ブラウザで `http://localhost:5173` を開いてください。

> OpenSky Network API はレート制限があります。制限に達した場合、自動的にシミュレーションモードに切り替わります（上部バーに `SIM` 表示）。

## データソース

| データ | ソース | 更新間隔 |
|---|---|---|
| 航空機位置 | [OpenSky Network](https://opensky-network.org/) | 20秒 |
| 衛星TLEデータ | [CelesTrak](https://celestrak.org/) | 30分 |
| 気象レーダー | [RainViewer](https://www.rainviewer.com/) | 10分 |

## ライセンス

MIT
