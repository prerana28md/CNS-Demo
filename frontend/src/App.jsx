import { useState } from "react";

const initialKey = { p: "61", q: "53", n: "3233", e: "17" };

async function requestRsa(path, body) {
  const response = await fetch(`/api/rsa/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || "The RSA request could not be completed.");
  }
  return result;
}

function KeyFields({ mode, onModeChange, values, onChange }) {
  return (
    <>
      <div className="mode-switch key-mode-switch" role="group" aria-label="RSA key inputs">
        <button
          className={mode === "primes" ? "mode-option active" : "mode-option"}
          type="button"
          aria-pressed={mode === "primes"}
          onClick={() => onModeChange("primes")}
        >
          I know p and q
        </button>
        <button
          className={mode === "modulus" ? "mode-option active" : "mode-option"}
          type="button"
          aria-pressed={mode === "modulus"}
          onClick={() => onModeChange("modulus")}
        >
          I know n
        </button>
      </div>
      <div className="key-fields">
        {(mode === "primes"
          ? [
              ["p", "Prime p", "First prime number"],
              ["q", "Prime q", "A different prime number"],
            ]
          : [["n", "Modulus n", "Product of two different primes"]]
        ).map(([name, label, hint]) => (
          <label className="field" key={name}>
            <span className="field-label">{label}</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              spellCheck="false"
              value={values[name]}
              onChange={(event) => onChange(name, event.target.value)}
              aria-label={label}
            />
            <span className="field-hint">{hint}</span>
          </label>
        ))}
        <label className="field">
          <span className="field-label">PUBLIC EXPONENT e</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            spellCheck="false"
            value={values.e}
            onChange={(event) => onChange("e", event.target.value)}
            aria-label="Public exponent e"
          />
          <span className="field-hint">Must be coprime to φ(n)</span>
        </label>
      </div>
    </>
  );
}

function KeySteps({ result }) {
  if (!result) return null;
  return (
    <div className="step-list">
      {result.key_steps.map((step, index) => (
        <div className="step-row" key={step.title}>
          <span className="step-number">{String(index + 1).padStart(2, "0")}</span>
          <div>
            <strong>{step.title}</strong>
            <p>{step.detail}</p>
          </div>
        </div>
      ))}
      <details className="euclid-details">
        <summary>Show extended Euclidean algorithm</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>a</th><th>b</th><th>quotient</th><th>remainder</th></tr>
            </thead>
            <tbody>
              {result.euclidean_rows.map((row, index) => (
                <tr key={`${row.a}-${index}`}>
                  <td>{row.a}</td><td>{row.b}</td><td>{row.quotient}</td><td>{row.remainder}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function BlockSteps({
  title,
  rows,
  firstHeading,
  secondHeading,
  firstField,
  secondField,
  plaintextMode,
}) {
  if (!rows) return null;
  return (
    <section className="steps-section">
      <div className="section-kicker">THE WORKING</div>
      <h3>{title}</h3>
      <p className="muted">
        {plaintextMode === "integer"
          ? "The integer is encrypted as one RSA message block."
          : "Each UTF-8 byte is treated as one RSA message block."}
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>#</th><th>{firstHeading}</th><th>{secondHeading}</th><th>Calculation</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.index}>
                <td>{row.index}</td>
                <td className="mono">{row[firstField]}</td>
                <td className="mono">{row[secondField]}</td>
                <td className="mono calculation">{row.calculation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function App() {
  const [keyValues, setKeyValues] = useState(initialKey);
  const [keyMode, setKeyMode] = useState("primes");
  const [eRange, setERange] = useState({ min: "2", max: "100" });
  const [eOptions, setEOptions] = useState([]);
  const [optionsSummary, setOptionsSummary] = useState(null);
  const [keyResult, setKeyResult] = useState(null);
  const [plaintextMode, setPlaintextMode] = useState("text");
  const [message, setMessage] = useState("Hello, RSA!");
  const [integerMessage, setIntegerMessage] = useState("42");
  const [ciphertext, setCiphertext] = useState("");
  const [encrypted, setEncrypted] = useState(null);
  const [decrypted, setDecrypted] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  function getKeyPayload() {
    return keyMode === "modulus"
      ? { key_mode: keyMode, n: keyValues.n, e: keyValues.e }
      : { key_mode: keyMode, p: keyValues.p, q: keyValues.q, e: keyValues.e };
  }

  function updateKey(name, value) {
    setKeyValues((current) => ({ ...current, [name]: value }));
    if (name !== "e") {
      setEOptions([]);
      setOptionsSummary(null);
    }
    setKeyResult(null);
    setEncrypted(null);
    setDecrypted(null);
  }

  function updateKeyMode(mode) {
    setKeyMode(mode);
    setEOptions([]);
    setOptionsSummary(null);
    setKeyResult(null);
    setEncrypted(null);
    setDecrypted(null);
  }

  async function findCoprimeExponents() {
    setBusy("options");
    setError("");
    try {
      const result = await requestRsa("key-options", {
        ...getKeyPayload(),
        e_min: eRange.min,
        e_max: eRange.max,
      });
      setEOptions(result.exponents);
      setOptionsSummary(result.key);
      if (!result.exponents.includes(keyValues.e) && result.exponents.length > 0) {
        setKeyValues((current) => ({ ...current, e: result.exponents[0] }));
      }
    } catch (requestError) {
      setEOptions([]);
      setOptionsSummary(null);
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  }

  function updatePlaintextMode(mode) {
    setPlaintextMode(mode);
    setEncrypted(null);
    setDecrypted(null);
    setCiphertext("");
  }

  async function calculateKey() {
    setBusy("key");
    setError("");
    try {
      const result = await requestRsa("key-details", getKeyPayload());
      setKeyResult(result);
      setEncrypted(null);
      setDecrypted(null);
    } catch (requestError) {
      setKeyResult(null);
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  }

  async function encryptMessage(event) {
    event.preventDefault();
    setBusy("encrypt");
    setError("");
    try {
      const value = plaintextMode === "integer" ? integerMessage : message;
      const result = await requestRsa("encrypt", {
        ...getKeyPayload(),
        plaintext_mode: plaintextMode,
        message: value,
      });
      setKeyResult(result);
      setEncrypted(result);
      setDecrypted(null);
      setCiphertext(result.ciphertext.join(", "));
    } catch (requestError) {
      setEncrypted(null);
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  }

  async function decryptMessage(event) {
    event.preventDefault();
    setBusy("decrypt");
    setError("");
    try {
      const blocks = ciphertext.split(/[\s,]+/).filter(Boolean);
      const result = await requestRsa("decrypt", {
        ...getKeyPayload(),
        plaintext_mode: plaintextMode,
        ciphertext: blocks,
      });
      setKeyResult(result);
      setDecrypted(result);
    } catch (requestError) {
      setDecrypted(null);
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="RSA Lab home">
          <span className="brand-mark">R</span>
          <span>FIELDNOTES <span className="brand-divider">/</span> CRYPTOGRAPHY</span>
        </a>
        <span className="topbar-note"><span className="status-dot" /> INTERACTIVE LEARNING LAB</span>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span>01</span><span className="eyebrow-line" /> PUBLIC-KEY CRYPTOGRAPHY</div>
            <h1>RSA, made<br /><em>visible.</em></h1>
            <p>Change the numbers. Follow every step. See how a message becomes ciphertext — and comes back again.</p>
          </div>
          <div className="hero-aside">
            <div className="hero-equation">c ≡ m<sup>e</sup> (mod n)</div>
            <div className="hero-equation secondary">m ≡ c<sup>d</sup> (mod n)</div>
            <span>ENCRYPT <i>↗</i> DECRYPT</span>
          </div>
        </section>

        <div className="notice">
          <span className="notice-icon">i</span>
          <p><strong>For learning, not for secrets.</strong> This is textbook RSA without padding. It is deliberately simple and is not secure for real-world encryption.</p>
        </div>

        {error && (
          <div className="error-banner" role="alert">
            <strong>Could not complete that step</strong>
            <span>{error}</span>
            <button type="button" onClick={() => setError("")} aria-label="Dismiss error">×</button>
          </div>
        )}

        <div className="workspace-grid">
          <aside className="controls-column">
            <section className="panel key-panel">
              <div className="panel-heading">
                <span className="panel-index">01 / KEY</span>
                <span className="lock-mark" aria-hidden="true">◇</span>
              </div>
              <h2>Set your key</h2>
              <p className="panel-description">Enter two primes, or provide their modulus n and let the lab recover the factors.</p>
              <KeyFields
                mode={keyMode}
                onModeChange={updateKeyMode}
                values={keyValues}
                onChange={updateKey}
              />
              {keyMode === "modulus" && (
                <p className="factor-note">
                  To calculate a private key from n, this learning tool factors n. This option supports n up to 1,000,000,000,000.
                </p>
              )}
              <div className="exponent-range">
                <div className="range-heading">
                  <span className="field-label">FIND COPRIME e VALUES IN RANGE</span>
                  <span className="range-subtitle">inclusive</span>
                </div>
                <div className="range-controls">
                  <label className="field">
                    <span className="field-hint">From</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={eRange.min}
                      onChange={(event) => {
                        setERange((current) => ({ ...current, min: event.target.value }));
                        setEOptions([]);
                        setOptionsSummary(null);
                      }}
                      aria-label="Minimum e value"
                    />
                  </label>
                  <span className="range-separator">to</span>
                  <label className="field">
                    <span className="field-hint">Through</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={eRange.max}
                      onChange={(event) => {
                        setERange((current) => ({ ...current, max: event.target.value }));
                        setEOptions([]);
                        setOptionsSummary(null);
                      }}
                      aria-label="Maximum e value"
                    />
                  </label>
                </div>
                <button
                  className="button button-secondary full-width"
                  type="button"
                  onClick={findCoprimeExponents}
                  disabled={Boolean(busy)}
                >
                  {busy === "options" ? "Finding valid exponents…" : "Find coprime e values"}
                  <span aria-hidden="true">↗</span>
                </button>
                {optionsSummary && (
                  <div className="exponent-options">
                    <label className="field">
                      <span className="field-label">
                        VALID e VALUES {optionsSummary.phi && `(coprime to φ(n) = ${optionsSummary.phi})`}
                      </span>
                      {eOptions.length > 0 ? (
                        <select
                          value={eOptions.includes(keyValues.e) ? keyValues.e : eOptions[0]}
                          onChange={(event) => updateKey("e", event.target.value)}
                          aria-label="Choose a coprime public exponent"
                        >
                          {eOptions.map((exponent) => (
                            <option key={exponent} value={exponent}>{exponent}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="field-hint">No coprime exponents found in this range.</span>
                      )}
                    </label>
                    {eOptions.length > 0 && (
                      <span className="field-hint">
                        {eOptions.length} valid {eOptions.length === 1 ? "choice" : "choices"}; selecting one updates e above.
                      </span>
                    )}
                  </div>
                )}
              </div>
              <button className="button button-secondary full-width" type="button" onClick={calculateKey} disabled={Boolean(busy)}>
                {busy === "key" ? "Working out the key…" : "Calculate key values"}
                <span aria-hidden="true">↗</span>
              </button>
              <div className="default-note">EXAMPLE VALUES <span>p = 61 · q = 53 · e = 17</span></div>
              {keyResult && (
                <div className="key-output">
                  <div className="key-output-heading">YOUR KEY PAIR <span>✓ READY</span></div>
                  <div className="key-value"><span>Modulus <b>n</b></span><strong>{keyResult.key.n}</strong></div>
                  <div className="key-value"><span>Totient <b>φ(n)</b></span><strong>{keyResult.key.phi}</strong></div>
                  <div className="key-value"><span>Public key <b>(n, e)</b></span><strong>({keyResult.key.n}, {keyResult.key.e})</strong></div>
                  <div className="key-value private-value"><span>Private exponent <b>d</b></span><strong>{keyResult.key.d}</strong></div>
                  <KeySteps result={keyResult} />
                </div>
              )}
            </section>
            <div className="formula-card">
              <span className="formula-label">THE KEY RELATIONSHIP</span>
              <p>e × d ≡ 1 <span>(mod φ(n))</span></p>
              <span className="formula-foot">The private exponent reverses the public one.</span>
            </div>
          </aside>

          <div className="operations-column">
            <section className="panel operation-panel">
              <div className="panel-heading">
                <span className="panel-index">02 / ENCRYPT</span>
                <span className="round-index">A</span>
              </div>
              <h2>Turn plaintext into numbers</h2>
              <p className="panel-description">Choose text or a single integer as your plaintext. Each block is encrypted with your public key.</p>
              <div className="mode-switch" role="group" aria-label="Plaintext type">
                <button
                  className={plaintextMode === "text" ? "mode-option active" : "mode-option"}
                  type="button"
                  aria-pressed={plaintextMode === "text"}
                  onClick={() => updatePlaintextMode("text")}
                >
                  Text <span>UTF-8 bytes</span>
                </button>
                <button
                  className={plaintextMode === "integer" ? "mode-option active" : "mode-option"}
                  type="button"
                  aria-pressed={plaintextMode === "integer"}
                  onClick={() => updatePlaintextMode("integer")}
                >
                  Integer <span>0 ≤ m &lt; n</span>
                </button>
              </div>
              <form onSubmit={encryptMessage}>
                {plaintextMode === "integer" ? (
                  <label className="field">
                    <span className="field-label">INTEGER PLAINTEXT m</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      spellCheck="false"
                      value={integerMessage}
                      onChange={(event) => setIntegerMessage(event.target.value)}
                      placeholder="Enter a non-negative integer"
                    />
                    <span className="field-hint">Use a whole number from 0 to n − 1.</span>
                  </label>
                ) : (
                  <label className="field">
                    <span className="field-label">PLAINTEXT MESSAGE</span>
                    <textarea maxLength={4096} rows={3} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write any text…" />
                    <span className="field-hint align-right">{new TextEncoder().encode(message).length} / 4096 bytes</span>
                  </label>
                )}
                <button className="button button-primary" type="submit" disabled={Boolean(busy)}>
                  {busy === "encrypt" ? "Encrypting…" : "Encrypt plaintext"} <span aria-hidden="true">→</span>
                </button>
              </form>
              {encrypted && (
                <div className="result-block">
                  <div className="result-heading"><span>CIPHERTEXT</span><span>{encrypted.ciphertext.length} {encrypted.ciphertext.length === 1 ? "BLOCK" : "BLOCKS"}</span></div>
                  {plaintextMode === "integer" ? (
                    <div className="byte-strip">
                      <div className="byte-item">
                        <span className="byte-index">INTEGER m</span>
                        <span className="byte-value">{encrypted.message_integer}</span>
                        <span className="byte-arrow">↓</span>
                        <span className="byte-cipher">{encrypted.ciphertext[0]}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="byte-strip">
                      {encrypted.message_bytes.map((byte, index) => (
                        <div className="byte-item" key={`${index}-${byte}`}>
                          <span className="byte-index">BYTE {index + 1}</span>
                          <span className="byte-value">{byte}</span>
                          <span className="byte-arrow">↓</span>
                          <span className="byte-cipher">{encrypted.ciphertext[index]}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <BlockSteps
                    title="Encryption, block by block"
                    rows={encrypted.encryption_steps}
                    firstHeading={plaintextMode === "integer" ? "Integer m" : "Message byte m"}
                    secondHeading="Ciphertext c"
                    firstField="message_block"
                    secondField="ciphertext"
                    plaintextMode={plaintextMode}
                  />
                </div>
              )}
            </section>

            <section className="panel operation-panel decrypt-panel">
              <div className="panel-heading">
                <span className="panel-index">03 / DECRYPT</span>
                <span className="round-index">B</span>
              </div>
              <h2>Bring it back</h2>
              <p className="panel-description">Paste or edit ciphertext blocks. Decryption uses the current plaintext type and matching private key.</p>
              <form onSubmit={decryptMessage}>
                <label className="field">
                  <span className="field-label">{plaintextMode === "integer" ? "CIPHERTEXT INTEGER" : "CIPHERTEXT BLOCKS"}</span>
                  <textarea rows={3} value={ciphertext} onChange={(event) => setCiphertext(event.target.value)} placeholder={plaintextMode === "integer" ? "Enter one ciphertext integer" : "For example: 2644, 1313,  ..."} />
                  <span className="field-hint">{plaintextMode === "integer" ? "Integer mode takes exactly one non-negative ciphertext block." : "Separate each non-negative integer with a comma or space."}</span>
                </label>
                <button className="button button-secondary" type="submit" disabled={Boolean(busy)}>
                  {busy === "decrypt" ? "Decrypting…" : "Decrypt blocks"} <span aria-hidden="true">→</span>
                </button>
              </form>
              {decrypted && (
                <div className="decrypted-result">
                  <div className="result-heading"><span>RECOVERED PLAINTEXT</span><span>{plaintextMode === "integer" ? "INTEGER" : "UTF-8"}</span></div>
                  <p className="plaintext-output">{decrypted.plaintext || <span className="muted">The ciphertext represents an empty message.</span>}</p>
                  {plaintextMode === "text" && (
                    <div className="decoded-bytes">DECODED BYTES <span>{decrypted.decrypted_bytes.join(" · ") || "—"}</span></div>
                  )}
                  <BlockSteps
                    title="Decryption, block by block"
                    rows={decrypted.decryption_steps}
                    firstHeading="Ciphertext c"
                    secondHeading={plaintextMode === "integer" ? "Integer m" : "Message byte m"}
                    firstField="ciphertext"
                    secondField="message_block"
                    plaintextMode={plaintextMode}
                  />
                </div>
              )}
            </section>
          </div>
        </div>

        <section className="how-it-works">
          <div className="how-heading">
            <div><div className="section-kicker">A SHORT FIELD GUIDE</div><h2>What is happening?</h2></div>
            <p>RSA uses a pair of related keys. The numbers are small here so you can see the entire process.</p>
          </div>
          <div className="guide-grid">
            <article><span>01</span><h3>Build the keys</h3><p>Multiply two primes to get n. Their relationship lets us calculate the public exponent e and its private inverse d.</p></article>
            <article><span>02</span><h3>Encrypt each byte</h3><p>Turn the text into UTF-8 bytes, then compute c = m<sup>e</sup> mod n with the public key (n, e).</p></article>
            <article><span>03</span><h3>Decrypt the blocks</h3><p>Use d to reverse each block: m = c<sup>d</sup> mod n. Join the recovered bytes to restore the text.</p></article>
          </div>
        </section>
      </main>

      <footer>
        <span>FIELDNOTES <span className="brand-divider">/</span> RSA LAB</span>
        <span>AN INTERACTIVE INTRODUCTION TO PUBLIC-KEY CRYPTOGRAPHY</span>
      </footer>
    </div>
  );
}
