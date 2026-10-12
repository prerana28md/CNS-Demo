import re
import secrets
from math import gcd

from flask import Flask, jsonify, request
from werkzeug.exceptions import BadRequest


MAX_INTEGER_BITS = 4096
MAX_MESSAGE_BYTES = 4096
MAX_FACTORABLE_MODULUS = 1_000_000_000_000
MAX_EXPONENT_RANGE = 5000


class InputError(ValueError):
    pass


def parse_integer(value, label, minimum=0):
    if isinstance(value, bool):
        raise InputError(f"{label} must be a whole number.")
    if isinstance(value, int):
        number = value
    elif isinstance(value, str) and re.fullmatch(r"[0-9]+", value.strip()):
        if len(value.strip()) > 1234:
            raise InputError(f"{label} must be no more than {MAX_INTEGER_BITS} bits.")
        number = int(value.strip())
    else:
        raise InputError(f"{label} must be a non-negative whole number.")

    if number < minimum:
        raise InputError(f"{label} must be at least {minimum}.")
    if number.bit_length() > MAX_INTEGER_BITS:
        raise InputError(f"{label} must be no more than {MAX_INTEGER_BITS} bits.")
    return number


def is_probable_prime(number):
    if number < 2:
        return False
    small_primes = (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37)
    for prime in small_primes:
        if number == prime:
            return True
        if number % prime == 0:
            return False

    odd_part = number - 1
    powers_of_two = 0
    while odd_part % 2 == 0:
        powers_of_two += 1
        odd_part //= 2

    for _ in range(24):
        base = secrets.randbelow(number - 3) + 2
        witness = pow(base, odd_part, number)
        if witness in (1, number - 1):
            continue
        for _ in range(powers_of_two - 1):
            witness = pow(witness, 2, number)
            if witness == number - 1:
                break
        else:
            return False
    return True


def extended_gcd(first, second):
    old_remainder, remainder = first, second
    old_coefficient, coefficient = 1, 0
    rows = []

    while remainder:
        quotient = old_remainder // remainder
        next_remainder = old_remainder - quotient * remainder
        rows.append({
            "a": str(old_remainder),
            "b": str(remainder),
            "quotient": str(quotient),
            "remainder": str(next_remainder),
        })
        old_remainder, remainder = remainder, next_remainder
        old_coefficient, coefficient = (
            coefficient,
            old_coefficient - quotient * coefficient,
        )
    return old_remainder, old_coefficient, rows


def factor_modulus(value):
    n = parse_integer(value, "n", minimum=6)
    if n > MAX_FACTORABLE_MODULUS:
        raise InputError(
            f"Finding p and q from n is limited to n ≤ {MAX_FACTORABLE_MODULUS} "
            "for this educational factorization tool."
        )

    divisor = 2
    while divisor <= n // divisor:
        if n % divisor == 0:
            other_factor = n // divisor
            if divisor == other_factor:
                raise InputError("n must be the product of two different primes.")
            if not is_probable_prime(divisor) or not is_probable_prime(other_factor):
                raise InputError("n must be the product of two different primes.")
            return divisor, other_factor
        divisor = 3 if divisor == 2 else divisor + 2

    raise InputError("Could not factor n into two different prime numbers.")


def resolve_factors(payload):
    key_mode = payload.get("key_mode", "primes")
    if key_mode == "modulus":
        return factor_modulus(payload.get("n"))
    if key_mode != "primes":
        raise InputError("key_mode must be either 'primes' or 'modulus'.")
    return (
        parse_integer(payload.get("p"), "p", minimum=2),
        parse_integer(payload.get("q"), "q", minimum=2),
    )


def build_key(payload):
    p, q = resolve_factors(payload)
    e = parse_integer(payload.get("e"), "e", minimum=2)

    if p == q:
        raise InputError("p and q must be different primes.")
    if not is_probable_prime(p):
        raise InputError("p must be a prime number.")
    if not is_probable_prime(q):
        raise InputError("q must be a prime number.")

    n = p * q
    if n.bit_length() > MAX_INTEGER_BITS:
        raise InputError(f"p * q must be no more than {MAX_INTEGER_BITS} bits.")

    phi = (p - 1) * (q - 1)
    if e >= phi:
        raise InputError("e must be less than φ(n).")

    gcd_value, inverse, euclidean_rows = extended_gcd(e, phi)
    if gcd_value != 1:
        raise InputError("e must be coprime to φ(n), so gcd(e, φ(n)) must equal 1.")
    d = inverse % phi

    key = {
        "p": str(p),
        "q": str(q),
        "n": str(n),
        "phi": str(phi),
        "e": str(e),
        "d": str(d),
    }
    key_steps = [
        {
            "title": "Choose two distinct primes",
            "detail": (
                (
                    f"Factoring n = {n} gives p = {p} and q = {q}."
                    if payload.get("key_mode", "primes") == "modulus"
                    else f"p = {p} and q = {q}."
                )
                + " Both values passed the probable-prime check."
            ),
        },
        {"title": "Compute the modulus", "detail": f"n = p × q = {p} × {q} = {n}."},
        {
            "title": "Compute Euler's totient",
            "detail": f"φ(n) = (p − 1)(q − 1) = {p - 1} × {q - 1} = {phi}.",
        },
        {
            "title": "Check the public exponent",
            "detail": f"e = {e}; gcd(e, φ(n)) = 1, so the modular inverse exists.",
        },
        {
            "title": "Find the private exponent",
            "detail": f"d = e⁻¹ mod φ(n) = {e}⁻¹ mod {phi} = {d}, because "
            f"({e} × {d}) mod {phi} = {(e * d) % phi}.",
        },
    ]
    return key, key_steps, euclidean_rows


def get_json_payload():
    if not request.is_json:
        raise InputError("Send a JSON request with Content-Type: application/json.")
    try:
        payload = request.get_json()
    except BadRequest as error:
        raise InputError("Request body must contain valid JSON.") from error
    if not isinstance(payload, dict):
        raise InputError("The JSON body must be an object.")
    return payload


def create_app():
    app = Flask(__name__)

    @app.errorhandler(InputError)
    def handle_input_error(error):
        return jsonify({"error": str(error)}), 400

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok"})

    @app.post("/api/rsa/key-details")
    def key_details():
        payload = get_json_payload()
        key, key_steps, euclidean_rows = build_key(payload)
        return jsonify({
            "key": key,
            "key_steps": key_steps,
            "euclidean_rows": euclidean_rows,
        })

    @app.post("/api/rsa/key-options")
    def key_options():
        payload = get_json_payload()
        p, q = resolve_factors(payload)
        if p == q:
            raise InputError("p and q must be different primes.")
        if not is_probable_prime(p):
            raise InputError("p must be a prime number.")
        if not is_probable_prime(q):
            raise InputError("q must be a prime number.")

        n = p * q
        if n.bit_length() > MAX_INTEGER_BITS:
            raise InputError(f"p * q must be no more than {MAX_INTEGER_BITS} bits.")
        phi = (p - 1) * (q - 1)
        start = parse_integer(payload.get("e_min"), "e_min", minimum=2)
        end = parse_integer(payload.get("e_max"), "e_max", minimum=2)
        if end < start:
            raise InputError("The end of the e range must be greater than or equal to its start.")
        if end - start >= MAX_EXPONENT_RANGE:
            raise InputError(
                f"The e range can contain at most {MAX_EXPONENT_RANGE} numbers."
            )

        exponents = [
            str(candidate)
            for candidate in range(start, min(end, phi - 1) + 1)
            if gcd(candidate, phi) == 1
        ]
        return jsonify({
            "key": {
                "p": str(p),
                "q": str(q),
                "n": str(n),
                "phi": str(phi),
            },
            "e_min": str(start),
            "e_max": str(end),
            "exponents": exponents,
        })

    @app.post("/api/rsa/encrypt")
    def encrypt():
        payload = get_json_payload()
        key, key_steps, euclidean_rows = build_key(payload)
        plaintext_mode = payload.get("plaintext_mode", "text")
        if plaintext_mode not in ("text", "integer"):
            raise InputError("plaintext_mode must be either 'text' or 'integer'.")

        n = int(key["n"])
        e = int(key["e"])
        if plaintext_mode == "integer":
            plaintext_integer = parse_integer(payload.get("message"), "message")
            if plaintext_integer >= n:
                raise InputError("Integer plaintext must be less than n.")
            message_blocks = [plaintext_integer]
        else:
            if n <= 255:
                raise InputError(
                    "Text mode needs p * q greater than 255. Switch to integer mode "
                    "or use larger primes."
                )
            message = payload.get("message")
            if not isinstance(message, str):
                raise InputError("message must be text.")
            message_bytes = message.encode("utf-8")
            if len(message_bytes) > MAX_MESSAGE_BYTES:
                raise InputError(
                    f"message must be no more than {MAX_MESSAGE_BYTES} UTF-8 bytes."
                )
            message_blocks = list(message_bytes)

        ciphertext = [pow(block, e, n) for block in message_blocks]
        encryption_steps = [
            {
                "index": index + 1,
                "message_block": str(block),
                "ciphertext": str(ciphertext[index]),
                "calculation": f"{block}^{e} mod {n} = {ciphertext[index]}",
            }
            for index, block in enumerate(message_blocks)
        ]
        result = {
            "key": key,
            "key_steps": key_steps,
            "euclidean_rows": euclidean_rows,
            "plaintext_mode": plaintext_mode,
            "ciphertext": [str(value) for value in ciphertext],
            "encryption_steps": encryption_steps,
        }
        if plaintext_mode == "integer":
            result["message_integer"] = str(message_blocks[0])
        else:
            result["message"] = message
            result["message_bytes"] = message_blocks
        return jsonify(result)

    @app.post("/api/rsa/decrypt")
    def decrypt():
        payload = get_json_payload()
        key, key_steps, euclidean_rows = build_key(payload)
        plaintext_mode = payload.get("plaintext_mode", "text")
        if plaintext_mode not in ("text", "integer"):
            raise InputError("plaintext_mode must be either 'text' or 'integer'.")
        raw_ciphertext = payload.get("ciphertext")
        if not isinstance(raw_ciphertext, list):
            raise InputError("ciphertext must be an array of whole numbers.")
        if len(raw_ciphertext) > MAX_MESSAGE_BYTES:
            raise InputError(f"ciphertext must have no more than {MAX_MESSAGE_BYTES} blocks.")
        if plaintext_mode == "integer" and len(raw_ciphertext) != 1:
            raise InputError("Integer mode requires exactly one ciphertext block.")
        if plaintext_mode == "text" and int(key["n"]) <= 255 and raw_ciphertext:
            raise InputError(
                "Text mode needs p * q greater than 255. Switch to integer mode "
                "or use larger primes."
            )

        n = int(key["n"])
        d = int(key["d"])
        ciphertext = [
            parse_integer(value, f"ciphertext block {index + 1}")
            for index, value in enumerate(raw_ciphertext)
        ]
        if any(value >= n for value in ciphertext):
            raise InputError("Every ciphertext block must be less than n.")

        plaintext_blocks = [pow(value, d, n) for value in ciphertext]
        result = {
            "key": key,
            "key_steps": key_steps,
            "euclidean_rows": euclidean_rows,
            "plaintext_mode": plaintext_mode,
            "ciphertext": [str(value) for value in ciphertext],
            "decryption_steps": [
                {
                    "index": index + 1,
                    "ciphertext": str(value),
                    "message_block": str(plaintext_blocks[index]),
                    "calculation": (
                        f"{value}^{d} mod {n} = {plaintext_blocks[index]}"
                    ),
                }
                for index, value in enumerate(ciphertext)
            ],
        }
        if plaintext_mode == "integer":
            result["plaintext"] = str(plaintext_blocks[0])
            result["plaintext_integer"] = str(plaintext_blocks[0])
            result["decrypted_bytes"] = []
            return jsonify(result)

        if any(value > 255 for value in plaintext_blocks):
            raise InputError(
                "A decrypted block is outside the byte range. Check the key and ciphertext."
            )
        try:
            plaintext = bytes(plaintext_blocks).decode("utf-8")
        except UnicodeDecodeError as error:
            raise InputError(
                "The decrypted bytes are not valid UTF-8. Check the key and ciphertext."
            ) from error

        result["plaintext"] = plaintext
        result["decrypted_bytes"] = plaintext_blocks
        return jsonify(result)

    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
