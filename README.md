# <div id="top"></div>

## 目次

1. [環境](#環境)
2. [ディレクトリ構成](#ディレクトリ構成)
3. [開発環境構築](#開発環境構築)
4. [トラブルシューティング](#トラブルシューティング)


## 環境

| 言語・フレームワーク      | バージョン  |
| --------------------- | ---------- |
| Vue.js                | 18.2.0     |
| Node.js               | 16.17.0    |
| PostgreSQL            | ^8.11.3    |
| CDK                   | 1.3.6      |


| 主な AWS サービス       | バージョン   |
| --------------------- | ---------- |
| Aurora PostgreSQL     |  16.1      |
| S3                    |            |
| Cognito User Pool　　　|            |
| API Gateway           |            |
| Lambda                |            |


その他のパッケージのバージョンは package.json を参照してください

## ディレクトリ構成

❯ tree -a -I "node_modules|.next|.git|.pytest_cache|static" -L 2
.
├── bin
│   └── spa-sample-site.js
├── cdk.out
├── lib
│   ├── spa-sample-site-stack.js
│   ├── frontend
│   └── lambda
├── README.md
├── containers
│   ├── django
│   ├── front
│   ├── mysql
│   └── nginx
├── docker-compose.yml
├── frontend
│   ├── .gitignore
│   ├── README.md
│   ├── __test__
│   ├── components
│   ├── features
│   ├── next-env.d.ts
│   ├── package-lock.json
│   ├── package.json
│   ├── pages
│   ├── postcss.config.js
│   ├── public
│   ├── styles
│   ├── tailwind.config.js
│   └── tsconfig.json
└── infra
    ├── .gitignore
    ├── docker-compose.yml
    ├── main.tf
    ├── network.tf
    └── variables.tf

<p align="right">(<a href="#top">トップへ</a>)</p>

## 開発環境構築

CDK CLI と Node.js v18 以降をお使いのマシンにインストールする必要があります。
Docker を使用しない前提のサーバーレススタックですので、開発環境は CDK コマンドを使用して AWS 上にデプロイすることとします。

### テスト環境のデプロイ方法

以下の3ステップで backend と frontend のデプロイが完了します。
3つ目のステップは、初めてデプロイする際のみ必要です。2度目以降は行う必要がありません。

#### ステップ1

ターミナルで frontend ディレクトリに移動し、以下のコマンドを実行してください。

```
npm run build
```

#### ステップ2

ルートフォルダにある .env ファイルを以下の環境変数例と[環境変数の一覧](#環境変数の一覧)を元に作成します。

AWS_REGION=eu-west-1
AWS_STAGE=dev
AWS_PROFILE=dev
APP_NAME=sls
CDK_DEFAULT_ACCOUNT=1234567890
CDK_DEFAULT_REGION=eu-west-1
DB_USER=username
DB_PASSWORD=alsejbfsdfjhaiweury
DB_NAME=dbname

.env ファイルを作成後、ルートディレクトリに移動し、以下のコマンドで開発環境をデプロイします。

```
npm run deploy:dev
```

このコマンドは、デプロイする AWS アカウントの認証情報が default として .aws/credentials に設定されていることを前提としています。
認証情報が default 意外に保管されている場合は、それに応じて package.json ファイルの script -> deploy:dev -> --profile パラメータをを変更してください。

アカウントの認証情報設定方法：https://docs.aws.amazon.com/ja_jp/cli/latest/userguide/cli-configure-files.html#cli-configure-files-methods

#### ステップ3

ステップ2 完了後のコマンドアウトプットに含まれている vueappenv の値をすべてコピーし、frontend/.env に貼り付けてください。
以下のような環境変数となります。

VUE_APP_COGNITO_USER_POOL_ID=eu-west-1_123example
VUE_APP_COGNITO_CLIENT_ID=example23rui3asldjfblasie
VUE_APP_API_ENDPOINT=https://example.execute-api.eu-west-1.amazonaws.com/prod/
VUE_APP_MEDIA_BUCKET_URL=https://example-media-bucket.s3.eu-west-1.amazonaws.com
VUE_APP_SITE_URL=https://example.cloudfront.net

frontend/.env ファイルを作成後、ルートディレクトリから以下のコマンドで開発環境を再デプロイします。

```
cd frontend && npm run build
cd .. && npm run deploy:dev

```

### 動作確認

デプロイが完了しましたら、アウトプットに含まれている VUE_APP_SITE_URL のURLにアクセスできるか確認します。
フロントエンドにアクセスできたら成功です。

### 環境変数の一覧

| 変数名                 | 役割                                      | デフォルト値                       | DEV 環境での値                           |
| ---------------------- | ----------------------------------------- | ---------------------------------- | ---------------------------------------- |
| MYSQL_ROOT_PASSWORD    | MySQL のルートパスワード（Docker で使用） | root                               |                                          |
| MYSQL_DATABASE         | MySQL のデータベース名（Docker で使用）   | django-db                          |                                          |
| MYSQL_USER             | MySQL のユーザ名（Docker で使用）         | django                             |                                          |
| MYSQL_PASSWORD         | MySQL のパスワード（Docker で使用）       | django                             |                                          |
| MYSQL_HOST             | MySQL のホスト名（Docker で使用）         | db                                 |                                          |
| MYSQL_PORT             | MySQL のポート番号（Docker で使用）       | 3306                               |                                          |
| SECRET_KEY             | Django のシークレットキー                 | secretkey                          | 他者に推測されないランダムな値にすること |
| ALLOWED_HOSTS          | リクエストを許可するホスト名              | localhost 127.0.0.1 [::1] back web | フロントのホスト名                       |
| DEBUG                  | デバッグモードの切り替え                  | True                               | False                                    |
| TRUSTED_ORIGINS        | CORS で許可するオリジン                   | http://localhost                   |                                          |
| DJANGO_SETTINGS_MODULE | Django アプリケーションの設定モジュール   | project.settings.local             | project.settings.dev                     |

### コマンド一覧

| Make                | 実行する処理                                                            | 元のコマンド                                                                               |
| ------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| make prepare        | node_modules のインストール、イメージのビルド、コンテナの起動を順に行う | docker-compose run --rm front npm install<br>docker-compose up -d --build                  |
| make up             | コンテナの起動                                                          | docker-compose up -d                                                                       |
| make build          | イメージのビルド                                                        | docker-compose build                                                                       |
| make down           | コンテナの停止                                                          | docker-compose down                                                                        |
| make loaddata       | テストデータの投入                                                      | docker-compose exec app poetry run python manage.py loaddata crm.json                      |
| make makemigrations | マイグレーションファイルの作成                                          | docker-compose exec app poetry run python manage.py makemigrations                         |
| make migrate        | マイグレーションを行う                                                  | docker-compose exec app poetry run python manage.py migrate                                |
| make show_urls      | エンドポイントをターミナル上で一覧表示                                  | docker-compose exec app poetry run python manage.py show_urls                              |
| make shell          | テストデータの投入                                                      | docker-compose exec app poetry run python manage.py debugsqlshell                          |
| make superuser      | スーパーユーザの作成                                                    | docker-compose exec app poetry run python manage.py createsuperuser                        |
| make test           | テストを実行                                                            | docker-compose exec app poetry run pytest                                                  |
| make test-cov       | カバレッジを表示させた上でテストを実行                                  | docker-compose exec app poetry run pytest --cov                                            |
| make format         | black と isort を使ってコードを整形                                     | docker-compose exec app poetry run black . <br> docker-compose exec app poetry run isort . |
| make update         | Poetry 内のパッケージの更新                                             | docker-compose exec app poetry update                                                      |
| make app            | アプリケーション のコンテナへ入る                                       | docker exec -it app bash                                                                   |
| make db             | データベースのコンテナへ入る                                            | docker exec -it db bash                                                                    |
| make pdoc           | pdoc ドキュメントの作成                                                 | docker-compose exec app env CI_MAKING_DOCS=1 poetry run pdoc -o docs application           |
| make init           | Terraform の初期化                                                      | docker-compose -f infra/docker-compose.yml run --rm terraform init                         |
| make fmt            | Terraform の設定ファイルをフォーマット                                  | docker-compose -f infra/docker-compose.yml run --rm terraform fmt                          |
| make validate       | Terraform の構成ファイルが正常であることを確認                          | docker-compose -f infra/docker-compose.yml run --rm terraform validate                     |
| make show           | 現在のリソースの状態を参照                                              | docker-compose -f infra/docker-compose.yml run --rm terraform show                         |
| make apply          | Terraform の内容を適用                                                  | docker-compose -f infra/docker-compose.yml run --rm terraform apply                        |
| make destroy        | Terraform で構成されたリソースを削除                                    | docker-compose -f infra/docker-compose.yml run --rm terraform destroy                      |


## トラブルシューティング

### .env: no such file or directory

.env ファイルがないので環境変数の一覧を参考に作成しましょう

### docker daemon is not running

Docker Desktop が起動できていないので起動させましょう

### Ports are not available: address already in use

別のコンテナもしくはローカル上ですでに使っているポートがある可能性があります
<br>
下記記事を参考にしてください
<br>
[コンテナ起動時に Ports are not available: address already in use が出た時の対処法について](https://qiita.com/shun198/items/ab6eca4bbe4d065abb8f)

### Module not found

make build

を実行して Docker image を更新してください

<p align="right">(<a href="#top">トップへ</a>)</p>
