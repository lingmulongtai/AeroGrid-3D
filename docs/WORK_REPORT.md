# 開発・検証報告（2026-10-13）

作業先: `C:/Users/lingm/Downloads/AeroGrid-3D-latest`。ブランチ: `codex/cloud-altitude-live-data`。

`lingmulongtai/AeroGrid-3D`の最新main `e73312b7ce61953997d7067e09c5e44a4990e26d`を新規クローンした。元のダウンロードフォルダ・ブランチは変更していない。作業後もリモートmainが同じSHAであることを確認した。push、PR作成、公開デプロイは行っていない。

## 実装した内容

- 航空機と衛星の軌跡・選択軌道を独立して切り替える。画質プリセットはスイッチ状態を変更しない。ISS・天宮の常時ラベルもLabels設定に従う。
- 雲を平面の点スプライトから、実際の厚みと断片ごとの深度を持つ楕円体へ変更した。横幅とは独立した高度・厚みで地球の外側へ収め、画面周辺の遠近変化も描画範囲へ含めた。
- ブルームは保持し、一般的な雲が過剰に発光しにくい閾値・強度へ調整した。周期的なHDR雲フラッシュを除去した。
- 無料のadsb.lol航空機、CelesTrak OMMからのSGP4軌道予測、GFS高度別雲予報、Fintrafficの船舶・公開カメラを接続した。観測、予測、デモを区別した。
- 設定画面にAISStream無料キーとADS-B Exchange有料RapidAPIキーの入力、取得先・料金リンクを追加した。キーを返却・ブラウザー保存せず、1時間の個別サーバー接続として扱う。
- 公開YouTube動画を座標付きで追加できる。配信元の公式プレーヤー・リンクを使用する。個々の動画のライブ状態や収益は保証しない。

取得元の比較・利用条件・設定方法は[DATA_SOURCES.md](DATA_SOURCES.md)にまとめた。God's Eye Viewの車は道路上のシミュレーションであり、個々の実車の位置データとして移植していない。

## 検証

| チェック | 結果・範囲 |
| --- | --- |
| TypeScript | `npm run lint`成功 |
| 単体・API | 全体57件成功。その後、周辺の雲境界に関する回帰テストを1件追加し、雲の数学テスト3件も成功 |
| ブラウザー全体 | デスクトップ1440×900・モバイル390×844で19件成功、端末条件に該当しない3件スキップ |
| 最後の雲境界修正 | デスクトップ・モバイルの雲シェーダー描画2件を再実行して成功 |
| 本番ビルド | クライアントとNodeサーバーをビルドできた |
| Linuxコンテナ | Dockerビルド、`node`ユーザーでの起動、API・静的ページのHTTP 200、CSPを確認。永続キャッシュ未設定時に本番の衛星取得を止めることも確認 |
| 実データの通し確認 | 実際のブラウザー→Node→各取得元→画面表示を確認。航空機119件（飛行中102件）、衛星300個表示・軌道要素16,693件、GFS9地点、船舶674件、カメラ812地点。ISSの実要素epochも確認。件数は時点によって変わる |
| キー | ブラウザーからのPOST、非保存、期限切れ、ユーザー間分離、切断時のキャンセル、再接続後も429待機が継続することをテスト。有効な利用者キーの実接続は未実施 |
| 依存関係監査 | `npm audit`は既存の15件（moderate 7、high 5、critical 3）を報告。初回`npm ci`時点にも同件数が存在し、この作業で依存関係全体の更新は行っていない |

最後のドキュメントコミット後にも`npm run check`（型・全単体/API・本番ビルド）を実行する。

## 残る確認・運用条件

- AISStreamと有料ADS-B Exchangeの実接続には利用者のキー・必要な契約が必要。設定保存と接続成功を区別する。
- 雲高度はGFS予報の気圧面高度、衛星位置は軌道予測。完全なライブ観測ではない。無料の船舶・カメラは地域限定。
- 利用者環境のGPU・Ultra画質で、すべてのちらつきが消えたという手動確認は未実施。特定した雲フラッシュと深度・周辺境界の不具合は修正し、ブラウザーで描画確認した。
- 本番の衛星取得には永続ストレージ上の`ORBIT_CACHE_PATH`が必要。現行Cloud Run設定へ永続ボリュームを追加・デプロイしていない。
- 既存の依存関係監査の指摘は残る。外部APIの可用性・網羅性・将来の無料枠は保証しない。

## コミット列

各単位に関連する型チェック、単体/APIテスト、またはブラウザーチェックを実行した。テストの追加と対象実装は、失敗する中間履歴を作らないように扱った。

| SHA | 件名 | 目的 |
| --- | --- | --- |
| `129f135` | fix: give satellite trails independent layer controls | 軌跡の独立切替・常時ラベルの設定尊重 |
| `8c37f1b` | fix: keep cloud volumes above the globe when tilted | 雲の実体・断片深度・高度の修正 |
| `b886112` | fix: retain bloom without synthetic cloud flashes | 過剰な周期発光を抑える |
| `dd33b33` | feat: define sourced orbital weather and maritime contracts | 取得元・時刻を持つ共通型 |
| `7688032` | build: add SGP4 and server AIS clients | 軌道計算・AIS通信の依存関係 |
| `660eaf0` | feat: support selectable regional aircraft providers | 実接続可能な無料航空機・選択可能な取得元 |
| `12d90a1` | feat: propagate cached CelesTrak orbital elements | 永続キャッシュと実軌道要素からの予測 |
| `c727855` | feat: fetch cloud heights from GFS pressure profiles | 地下の気圧面を除外する高度別雲予報 |
| `9b31cc8` | feat: read official regional ships and public cameras | 新鮮なAIS報告・公式カメラカタログ |
| `dd6fa23` | feat: share bounded caches for public live layers | 共通取得制限・失敗後の回復・地域範囲 |
| `eb2a456` | feat: isolate user API keys in expiring server connections | キーの分離・期限・API経路 |
| `5b4b809` | fix: prevent superseded live requests from restoring demo data | モード変更後の古い応答を排除 |
| `d7ed638` | fix: preserve paid feed cooldown across reconnects | 再接続でも有料取得の待機・上限を保持 |
| `9d78950` | feat: render live orbital predictions and forecast cloud heights | ライブ取得と描画・高度を接続 |
| `fc67083` | feat: configure free and paid feed keys in display settings | キー入力・取得先・料金案内 |
| `48a59d0` | perf: bound cloud overlap within small forecast regions | 小さな範囲での過密・過剰描画を抑える |
| `8c39bb3` | feat: explore public ships cameras and owner video streams | 地球上の選択・写真・公開動画・取得状態 |
| `35e5cb4` | build: keep live caches and local artifacts out of images | キャッシュ等の非追跡・非同梱 |
| `dd12911` | fix: identify demo status as simulation | デモをライブと表示しない |
| `17b924c` | test: cover live controls credentials and public contact picking | デスクトップ・モバイルの操作回帰確認 |
| `1a9ad33` | fix: include perspective shift in peripheral cloud bounds | 画面周辺の雲の描画切れを防ぐ |

この報告書・調査ガイド・README・変更履歴は、別のドキュメントコミットで保存する。
