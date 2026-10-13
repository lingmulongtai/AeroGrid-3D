# ライブデータ調査・接続手順

調査日: 2026-10-13。実際のHTTP取得と公式仕様を確認した。取得件数は受信状況と時刻により変わる。

## 現在の実装

| レイヤー | 標準の取得元 | データの意味・範囲 | 更新・制限 |
| --- | --- | --- | --- |
| 航空機 | adsb.lol、キー不要 | 地域内のADS-B受信位置。半径最大250海里、受信局のない地域は欠測 | サーバー共通60秒キャッシュ、1秒に1回、450回/日。古い位置報告は除外 |
| 衛星 | CelesTrak OMM、キー不要 | 公開軌道要素からSGP4で予測した位置。ライブの位置テレメトリーではない | 永続キャッシュを最低2時間保持。非200・失敗時は自動取得を停止。キャッシュ24時間、軌道要素14日を超えるものは非表示 |
| 雲 | Open-Meteo GFS、キー不要 | 地域9地点、1000/925/850/700/500/300 hPaの予報雲量とジオポテンシャル高度。観測した雲の実体ではない | 30分キャッシュ、全体2秒間隔、400回/日、同時取得4件以下 |
| 雨 | RainViewer、キー不要 | 観測された降水レーダーを雨粒に変換。雨の柱の高さは近隣の予報雲高度を使う描画上の推定 | メタデータ10分キャッシュ。雲の高度を降雨強度から捏造しない |
| 船舶 | Fintraffic、キー不要 | フィンランド周辺・バルト海の受信局が対象。Class A、漁船は対象外 | 60秒キャッシュ。`timestampExternal`のエポック時刻で5分を超える報告を除外 |
| 公開カメラ | Fintraffic、キー不要 | フィンランドの公式気象カメラ。動画ではなく、おおむね10分更新の静止画 | 地点カタログ1時間キャッシュ。画像取得失敗時は配信元リンクを表示 |
| 追加の公開配信 | ユーザーが登録したYouTube動画 | 公開・埋め込み可能な動画のURLと座標。配信の稼働・ライブ状態は配信元依存 | 動画を選択して公式プレーヤーで再生。自動探索やライブ状態の検証は行わない |

デモモードは従来の決定論的シミュレーションを保持する。ライブモードで取得に失敗したレイヤーへデモの物体を補充しない。サイドバーの「取得元・更新時刻を確認」で各レイヤーの取得状態を確認できる。カメラの取得時刻は地点カタログの取得時刻であり、写真の撮影時刻ではない。

衛星の軌跡・選択中の軌道は、航空機とは独立したサイドバーのスイッチで切り替える。ラベルをオフにすればISS・天宮の常時ラベルも表示しない。選択時の詳細・ホバーは利用できる。

## APIキーを設定する

画面右側の「表示設定」→「ライブデータ接続」で取得元を選び、キーを入力して「接続設定を適用」を押す。設定の保存は接続成功の証明ではなく、実際の取得結果を各ライブレイヤーに表示する。

- **AISStream（無料・キーが必要）**: [公式サイト](https://aisstream.io/)でGitHubアカウントを使ってキーを作成する。「船舶」でAISStreamを選択して入力し、ライブベータで船舶をオンにして現在のエリアを読み込む。[公式仕様](https://aisstream.io/documentation)はブラウザーからの直接接続を禁止しているため、サーバーからWebSocketで接続する。受信局に依存し、世界の全船舶を保証しない。非接続・拒否時には再設定が必要。
- **ADS-B Exchange / RapidAPI（有料）**: [公式Developer Hub](https://www.adsbexchange.com/community/developer-hub/)から[RapidAPIのプラン](https://rapidapi.com/adsbx/api/adsbexchange-com1/pricing)を確認・契約する。「航空機」で選択してRapidAPIキーを入力する。契約や支払いはアプリ内で行わない。リクエスト数・帯域の超過料金があり得るため、現行プランを確認する。キー付きの実取得は未検証。
- **Airplanes.live（従来の取得元）**: 選択肢を残したが、今回の実取得ではHTTP 403だった。成功するものとして扱わない。

キーは同一オリジンのPOST本文で送り、サーバーのメモリに最大1時間だけ保持する。ブラウザーのsessionStorageには不透明な接続トークンだけを保持する。切断・期限切れでキーを破棄し、待機中・実行中の有料取得を停止する。期限切れに別の取得元へ黙って切り替えない。サーバー再起動後は再入力する。HTTPSまたはlocalhostが必要。

無料の航空機キャッシュ・取得上限は利用者間で共有する。有料取得も全体450回/日の保護上限と1秒間隔を共有し、HTTP 429の待機時間を再接続でリセットしない。これらは提供元の月間課金上限を保証するものではない。

YouTubeは表示設定の「公開YouTube配信」へ動画URL・名前・緯度・経度を入力する。APIキーは不要。配信元を開くリンクは常に残す。動画の選択・再生・広告配信はYouTube側が管理し、制作者の収益をこのアプリが保証するものではない。[公式埋め込み仕様](https://developers.google.com/youtube/player_parameters)

## 衛星キャッシュの運用

ローカルでは`.cache/orbits.json`を使用する。起動後もこのファイルを維持する。CelesTrakはGP/SupGPの取得を2時間以上空け、非200応答後は人が原因を調査するまで自動取得を止めるよう求めている。[利用方針](https://celestrak.org/usage-policy.php)

本番環境では、永続ストレージ上のパス、または`gs://bucket/object`を`ORBIT_CACHE_PATH`へ設定しない限り、衛星の自動取得を開始しない。Cloud Runのコンテナ内一時ファイルは永続ストレージとして扱わない。Cloud Storageでは既存の実行サービスIDで認証し、同じオブジェクトの世代番号を条件にして更新権を取得する。2地域・新旧revisionが重なっても、更新権を得たサーバーだけがCelesTrakを取得する。正常なキャッシュは2時間メモリーにも保持し、画面のポーリングごとにCloud Storageから全要素を再転送しない。[世代条件の仕様](https://docs.cloud.google.com/storage/docs/request-preconditions)

既存Cloud Run公開先は`asia-northeast1`と`us-west1`。`gs://gen-lang-client-0867951986-orbit-cache/orbits.json`を共通の非公開キャッシュにする。東京側はリポジトリのCloud Build設定、西側は別の既存トリガーを使用する。ストレージは公開せず、APIキーも保存しない。デプロイ後の確認結果は[PR #22](https://github.com/lingmulongtai/AeroGrid-3D/pull/22)へ記録する。

キャッシュに`blocked`が記録された場合は、HTTPエラー・提供元の告知・ネットワークを確認し、問題を解消した後に管理者がその項目を削除する。自動で解除しない。レスポンス時刻やキャッシュが壊れている場合も自動取得を止める。

## 取得元の比較と根拠

- **adsb.lol**: ODbL 1.0。商用利用にもライセンス条件がある。無料APIに固定の数値上限は公表されておらず、本番利用は運営者への相談が求められる。[仕様・ライセンス](https://www.adsb.lol/docs/open-data/api/)、[公式OpenAPI](https://api.adsb.lol/api/openapi.json)。ブラウザー向けCORSヘッダーが今回の応答にないため、サーバー経由で取得する。
- **Open-Meteo GFS**: 高度変数はメートルAMSL、雲量は各気圧面のモデル雲量。地表気圧より下、地面より低い高度を除外する。無料APIは非商用・日10,000回未満、時間5,000回、分600回の条件がある。多地点・変数数による計算も考慮する。[高度・雲量の仕様](https://open-meteo.com/en/docs/gfs-api)、[利用条件](https://open-meteo.com/en/terms)。データはCC BY 4.0。
- **CelesTrak**: 新しい6桁のカタログ番号も扱えるOMM JSONを採用。[フォーマット](https://celestrak.org/NORAD/documentation/gp-data-formats.php)。SGP4の実装はMITライセンスの[satellite.js](https://github.com/shashwatak/satellite-js)。軌道予測の誤差は要素の古さ・機動・抗力などに依存する。
- **Fintraffic**: CC BY 4.0。船舶の地域範囲・除外対象を明示する。[船舶API](https://www.digitraffic.fi/en/marine-traffic/)、[AIS対象条件](https://www.digitraffic.fi/en/marine-traffic/ais/)、[カメラAPI](https://www.digitraffic.fi/en/road-traffic/)、[利用条件](https://www.digitraffic.fi/en/terms-of-service/)。
- **OpenSky**: 現在の利用規約では、運用サービスへREST APIを組み込む前に書面の利用契約が必要。無料枠があるだけでこの製品へ自動導入できるわけではない。[利用規約](https://opensky-network.org/about/terms-of-use)、[API仕様](https://github.com/openskynetwork/opensky-api/blob/master/docs/free/rest.rst)。今回は導入しない。
- **RainViewer**: 雲高度や3D雲の観測ではない。[公式API](https://www.rainviewer.com/api.html)。

God's Eye Viewは公開ソースをサーバーで集約する設計が参考になる。ただし[README](https://github.com/bilawalsidhu/gods-eye-view)は交通・車を実際の道路に沿ったシミュレーションと明記している。[車の描画コード](https://github.com/bilawalsidhu/gods-eye-view/blob/main/src/layers/traffic/animation.js)にもランダム配置・移動がある。個々の実車のライブ追跡として移植しない。[新宿カメラ設定](https://github.com/bilawalsidhu/gods-eye-view/blob/main/config/cctv_sources.shinjuku.json)には投影テスト用のサンプル動画も含まれるため、公開カメラの実配信と区別する。

## 今回の実接続確認

2026-10-13のローカルサーバー経由で、航空機130件、軌道要素16,693件、GFSの9地点、5分以内の船舶657件、カメラ812地点を取得した。これらはその時点の標本であり、恒常的な件数・完全な網羅性・外部APIの可用性を保証しない。

AISStreamと有料ADS-B Exchangeは仕様・接続経路・キーの分離・期限切れ・429待機をテストしたが、利用者の有効なキーによる実接続はまだ確認していない。YouTube動画の配信権限・ライブ状態も動画ごとに配信元で確認する。
