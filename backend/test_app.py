import unittest

from app import create_app


class RsaApiTests(unittest.TestCase):
    def setUp(self):
        self.client = create_app().test_client()
        self.key = {"p": "61", "q": "53", "e": "17"}

    def post(self, path, body):
        return self.client.post(path, json=body)

    def test_key_details_show_expected_rsa_values(self):
        response = self.post("/api/rsa/key-details", self.key)

        self.assertEqual(response.status_code, 200)
        result = response.get_json()
        self.assertEqual(result["key"]["n"], "3233")
        self.assertEqual(result["key"]["phi"], "3120")
        self.assertEqual(result["key"]["d"], "2753")
        self.assertGreater(len(result["euclidean_rows"]), 0)
        self.assertEqual(len(result["key_steps"]), 5)

    def test_key_can_be_calculated_from_modulus(self):
        response = self.post(
            "/api/rsa/key-details",
            {"key_mode": "modulus", "n": "3233", "e": "17"},
        )

        self.assertEqual(response.status_code, 200)
        result = response.get_json()
        self.assertEqual(
            int(result["key"]["p"]) * int(result["key"]["q"]),
            int(result["key"]["n"]),
        )
        self.assertEqual(result["key"]["phi"], "3120")
        self.assertEqual(result["key"]["d"], "2753")
        self.assertIn("Factoring n = 3233", result["key_steps"][0]["detail"])

    def test_lists_only_coprime_exponents_from_inclusive_range(self):
        response = self.post(
            "/api/rsa/key-options",
            {
                "key_mode": "modulus",
                "n": "3233",
                "e_min": "2",
                "e_max": "20",
            },
        )

        self.assertEqual(response.status_code, 200)
        result = response.get_json()
        self.assertEqual(result["key"]["phi"], "3120")
        self.assertEqual(result["exponents"], ["7", "11", "17", "19"])

    def test_modulus_mode_key_encrypts_and_decrypts_integer(self):
        key_from_modulus = {"key_mode": "modulus", "n": "3233", "e": "17"}
        encrypted = self.post(
            "/api/rsa/encrypt",
            {**key_from_modulus, "plaintext_mode": "integer", "message": "42"},
        )

        self.assertEqual(encrypted.status_code, 200)
        encrypted_result = encrypted.get_json()
        self.assertEqual(encrypted_result["ciphertext"], ["2557"])

        decrypted = self.post(
            "/api/rsa/decrypt",
            {
                **key_from_modulus,
                "plaintext_mode": "integer",
                "ciphertext": encrypted_result["ciphertext"],
            },
        )
        self.assertEqual(decrypted.status_code, 200)
        self.assertEqual(decrypted.get_json()["plaintext"], "42")

    def test_rejects_non_semiprime_and_too_large_modulus_inputs(self):
        invalid_factors = self.post(
            "/api/rsa/key-options",
            {
                "key_mode": "modulus",
                "n": "45",
                "e_min": "2",
                "e_max": "20",
            },
        )
        too_large = self.post(
            "/api/rsa/key-options",
            {
                "key_mode": "modulus",
                "n": "1000000000001",
                "e_min": "2",
                "e_max": "20",
            },
        )

        self.assertEqual(invalid_factors.status_code, 400)
        self.assertIn("two different primes", invalid_factors.get_json()["error"])
        self.assertEqual(too_large.status_code, 400)
        self.assertIn("limited to n", too_large.get_json()["error"])

    def test_custom_key_round_trips_utf8_message(self):
        message = "RSA, hello! 你好 🌍"
        encrypted = self.post(
            "/api/rsa/encrypt",
            {**self.key, "plaintext_mode": "text", "message": message},
        )
        self.assertEqual(encrypted.status_code, 200)
        encryption_result = encrypted.get_json()
        self.assertEqual(len(encryption_result["ciphertext"]), len(message.encode("utf-8")))
        self.assertTrue(encryption_result["encryption_steps"])

        decrypted = self.post(
            "/api/rsa/decrypt",
            {
                **self.key,
                "plaintext_mode": "text",
                "ciphertext": encryption_result["ciphertext"],
            },
        )
        self.assertEqual(decrypted.status_code, 200)
        decryption_result = decrypted.get_json()
        self.assertEqual(decryption_result["plaintext"], message)
        self.assertTrue(decryption_result["decryption_steps"])

    def test_empty_message_round_trips(self):
        encrypted = self.post(
            "/api/rsa/encrypt",
            {**self.key, "plaintext_mode": "text", "message": ""},
        )
        self.assertEqual(encrypted.status_code, 200)
        self.assertEqual(encrypted.get_json()["ciphertext"], [])

        decrypted = self.post(
            "/api/rsa/decrypt",
            {**self.key, "plaintext_mode": "text", "ciphertext": []},
        )
        self.assertEqual(decrypted.status_code, 200)
        self.assertEqual(decrypted.get_json()["plaintext"], "")

    def test_rejects_non_prime_and_invalid_public_exponent(self):
        composite = self.post(
            "/api/rsa/key-details", {**self.key, "p": "15"}
        )
        invalid_exponent = self.post(
            "/api/rsa/key-details", {**self.key, "e": "12"}
        )

        self.assertEqual(composite.status_code, 400)
        self.assertIn("prime", composite.get_json()["error"])
        self.assertEqual(invalid_exponent.status_code, 400)
        self.assertIn("coprime", invalid_exponent.get_json()["error"])

    def test_rejects_ciphertext_outside_modulus_and_non_utf8_result(self):
        outside_modulus = self.post(
            "/api/rsa/decrypt", {**self.key, "ciphertext": ["3233"]}
        )
        invalid_utf8_ciphertext = self.post(
            "/api/rsa/decrypt",
            {**self.key, "ciphertext": [str(pow(255, 17, 3233))]},
        )

        self.assertEqual(outside_modulus.status_code, 400)
        self.assertIn("less than n", outside_modulus.get_json()["error"])
        self.assertEqual(invalid_utf8_ciphertext.status_code, 400)
        self.assertIn("valid UTF-8", invalid_utf8_ciphertext.get_json()["error"])

    def test_rejects_oversized_decimal_strings_cleanly(self):
        response = self.post(
            "/api/rsa/key-details", {**self.key, "p": "9" * 2000}
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("4096 bits", response.get_json()["error"])

    def test_integer_plaintext_round_trips_with_small_modulus(self):
        small_key = {"p": "3", "q": "5", "e": "3"}
        encrypted = self.post(
            "/api/rsa/encrypt",
            {**small_key, "plaintext_mode": "integer", "message": "14"},
        )

        self.assertEqual(encrypted.status_code, 200)
        encryption_result = encrypted.get_json()
        self.assertEqual(encryption_result["key"]["n"], "15")
        self.assertEqual(encryption_result["ciphertext"], ["14"])
        self.assertEqual(encryption_result["encryption_steps"][0]["message_block"], "14")

        decrypted = self.post(
            "/api/rsa/decrypt",
            {
                **small_key,
                "plaintext_mode": "integer",
                "ciphertext": encryption_result["ciphertext"],
            },
        )
        self.assertEqual(decrypted.status_code, 200)
        self.assertEqual(decrypted.get_json()["plaintext"], "14")
        self.assertEqual(
            decrypted.get_json()["decryption_steps"][0]["message_block"], "14"
        )

    def test_integer_plaintext_must_be_less_than_modulus(self):
        response = self.post(
            "/api/rsa/encrypt",
            {
                "p": "3",
                "q": "5",
                "e": "3",
                "plaintext_mode": "integer",
                "message": "15",
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("less than n", response.get_json()["error"])

    def test_small_modulus_explains_text_mode_requirement(self):
        response = self.post(
            "/api/rsa/encrypt",
            {"p": "3", "q": "5", "e": "3", "plaintext_mode": "text", "message": "a"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Switch to integer mode", response.get_json()["error"])


if __name__ == "__main__":
    unittest.main()
