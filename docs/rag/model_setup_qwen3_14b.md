# Qwen-3 14B 量子化 & Ollama 登録ガイド

Qwen-3 14B（Instruct 系）を GGUF に変換して量子化し、Ollama から利用するまでの手順をまとめています。RAG サービス (`src/rag`) のバックエンドを `llama3:8b-instruct` から切り替える際の参考にしてください。

## 前提条件

- Hugging Face から取得した Qwen-3 14B Instruct モデル（例: `~/models/Qwen3-14B-Instruct`）
- [llama.cpp](https://github.com/ggerganov/llama.cpp) をローカルに clone 済み
- `python3`, `cmake`, `ninja` または `make` が利用可能
- `ollama` CLI v0.1.45 以降

> **ヒント:** モデルの保存先は任意です。本ガイドでは以下の環境変数でパスを受け取る想定です。
> ```bash
> export QWEN3_SRC=~/models/Qwen3-14B-Instruct
> export QWEN3_OUT=~/models/qwen3-14b-gguf
> export LLAMA_CPP=~/workspace/llama.cpp
> ```

## 1. llama.cpp のビルド（未実施の場合）

```bash
cd "$LLAMA_CPP"
cmake -S . -B build -DLLAMA_BUILD_EXAMPLES=OFF -DCMAKE_BUILD_TYPE=Release
cmake --build build --target quantize
```

`build/bin/quantize` が生成されていることを確認してください。

## 2. Hugging Face 形式から GGUF (F16) へ変換

```bash
mkdir -p "$QWEN3_OUT"
python3 "$LLAMA_CPP/scripts/convert-hf-to-gguf.py" \
  "$QWEN3_SRC" \
  --outfile "$QWEN3_OUT/qwen3-14b-f16.gguf" \
  --outtype f16
```

※ `--outtype f16` は量子化前に 16bit 浮動小数へ正規化する指定です。VRAM に余裕があれば `--outtype f32` も利用できます。

## 3. GGUF を量子化

代表的な量子化ターゲット:

| タイプ | 推論品質 | メモリ | 備考 |
| ------ | -------- | ------ | ---- |
| `Q4_K_M` | ◎ | 約 8.2 GB | RAG 用途のバランスが良い |
| `Q5_K_M` | ◎ | 約 9.6 GB | 余裕があればこちら |
| `Q4_0` | ○ | 約 6.2 GB | 最小メモリ向け |

コマンド例（Q4_K_M）:

```bash
"$LLAMA_CPP/build/bin/quantize" \
  "$QWEN3_OUT/qwen3-14b-f16.gguf" \
  "$QWEN3_OUT/qwen3-14b-q4_k_m.gguf" \
  Q4_K_M
```

## 4. Modelfile を準備

`docs/rag/modelfiles/qwen3-14b-q4km.Modelfile` を任意のディレクトリへコピーし、同じ場所に量子化済み GGUF を配置してください。

```bash
cp docs/rag/modelfiles/qwen3-14b-q4km.Modelfile "$QWEN3_OUT/"
cp "$QWEN3_OUT/qwen3-14b-q4_k_m.gguf" "$QWEN3_OUT/"
```

Modelfile 内の `FROM ./qwen3-14b-q4_k_m.gguf` が正しく参照できる配置になっていれば OK です。追加でテンプレートや既定 System Prompt を変更したい場合は Modelfile を編集してください。

## 5. Ollama へ登録

```bash
ollama create qwen3-14b-q4km -f "$QWEN3_OUT/qwen3-14b-q4km.Modelfile"
ollama list | grep qwen3
```

一覧に `qwen3-14b-q4km` が表示されれば登録完了です。

### 動作確認

```bash
ollama run qwen3-14b-q4km "簡単な自己紹介をしてください。"
```

応答が得られることを確認します。

## 6. RAG サービスの設定を更新

1. `.env.rag` またはシェル環境で `OLLAMA_MODEL=qwen3-14b-q4km` を設定します。
2. 既に RAG サービスが起動している場合は一度停止し、`scripts/run_rag_service.sh` で再起動します。
3. `curl http://127.0.0.1:8100/health` でヘルスチェックを行い、ログにモデル名が反映されていることを確認してください。

> **補足:** 既定値を恒久的に変更したい場合は `src/rag/config.py` の `ollama_model` デフォルト値を同じエイリアスへ書き換えてください。

## 7. トラブルシューティング

- `ValueError: unexpected tensor ...` が発生した場合は `llama.cpp` を最新に更新して再コンバートしてください。
- `context length exceeded` は `PARAMETER num_ctx` を増減させるか、RAG 側で投入するメッセージ履歴数を調整します。
- `ollama serve` がメモリ不足で落ちる場合は量子化タイプを `Q4_0` に切り替えるか、Swap を確保してください。

---

量子化済み GGUF のバックアップは `QWEN3_OUT` ディレクトリごと保存しておくと再作成が容易です。別の量子化設定を試す際も同ディレクトリを使い回せます。
