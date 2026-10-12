# RSA Learning Lab

An interactive RSA demonstration with a Flask API and a React/Vite frontend. Enter prime numbers `p` and `q`, or enter a modulus `n` and have the learning tool factor it. Search a chosen range for public exponents coprime to φ(n), then encrypt UTF-8 text or a single integer plaintext, edit ciphertext blocks, and decrypt them. The interface exposes key derivation, the extended Euclidean algorithm, and each modular-exponentiation step.

## Requirements

- Python 3.9+
- Node.js 18+

## Run locally

In one terminal, start the Flask API:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python app.py
```

In a second terminal, start the React app:

```powershell
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite (usually `http://localhost:5173`). Vite proxies `/api` requests to Flask on `http://127.0.0.1:5000`.

## RSA API

- `GET /api/health` — service status.
- `POST /api/rsa/key-details` — JSON `{ "p": "61", "q": "53", "e": "17" }`.
- `POST /api/rsa/key-details` — modulus input `{ "key_mode": "modulus", "n": "3233", "e": "17" }`; the tool factors `n` to recover `p` and `q`.
- `POST /api/rsa/key-options` — provide either `key_mode: "primes"` with `p` and `q`, or `key_mode: "modulus"` with `n`, plus inclusive `e_min` and `e_max` bounds. Returns exponents in that range coprime to φ(n).
- `POST /api/rsa/encrypt` — the key fields, `plaintext_mode` (`"text"` or `"integer"`), and a `message`. Integer plaintext must be a decimal integer in `[0, n)`.
- `POST /api/rsa/decrypt` — the key fields, `plaintext_mode`, and a `ciphertext` array of decimal integer strings. Integer mode accepts exactly one ciphertext block.

The key inputs and ciphertext are sent as decimal strings so large integers are not rounded by JavaScript. Inputs are limited to 4096 bits and text messages to 4096 UTF-8 bytes. `p` and `q` must be different primes; `e` must be less than `(p - 1)(q - 1)` and coprime to it. The interactive modulus-factor mode is intentionally limited to `n ≤ 1,000,000,000,000`; factoring a large RSA modulus is computationally infeasible. The exponent search range is limited to 5,000 numbers per request. Text mode requires `n > 255` because it encrypts each UTF-8 byte as an RSA block; integer mode works with any valid modulus as long as the plaintext is less than `n`.

## Important security note

This project uses textbook RSA, one byte per block, with no padding or hybrid encryption. It is intended only to teach the RSA arithmetic. It must not be used to protect real messages or private keys. Production RSA encryption requires a vetted cryptographic library and a padding scheme such as RSA-OAEP.
