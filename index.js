// api/index.js — API REST do CRM, como função serverless da Vercel.
// Todas as rotas /api/* chegam aqui (ver vercel.json).
// Os arquivos estáticos (index.html, style.css, app.js) são servidos
// direto pela Vercel a partir da raiz do projeto — não passam por aqui
// em produção. O express.static abaixo só existe para o teste local.

const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { obterSessao, salvarSessao, TTL_SEGUNDOS } = require("../lib/store");

const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use(express.static(path.join(__dirname, "..")));

const uid = () => crypto.randomBytes(6).toString("hex");
const estadoInicial = () => ({ clientes: [], negocios: [] });

function lerSid(req) {
  const m = (req.headers.cookie || "").match(/(?:^|;\s*)sid=([a-f0-9]{24})/);
  return m ? m[1] : null;
}

// ---------- sessão (cria/recupera a cada chamada de API) ----------
app.use(async (req, res, next) => {
  if (!req.path.startsWith("/api")) return next();

  let sid = lerSid(req);
  let sessao = sid ? await obterSessao(sid) : null;

  if (!sessao) {
    sid = crypto.randomBytes(12).toString("hex");
    sessao = estadoInicial();
    await salvarSessao(sid, sessao);
  }
  res.setHeader("Set-Cookie",
    `sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL_SEGUNDOS}${req.secure ? "; Secure" : ""}`);
  req.sid = sid;
  req.sessaoAtual = sessao;
  next();
});
const salvar = req => salvarSessao(req.sid, req.sessaoAtual);

app.post("/api/reset", async (req, res) => {
  req.sessaoAtual = estadoInicial();
  await salvar(req);
  res.json({ ok: true });
});

// ---------- clientes ----------
app.get("/api/clientes", (req, res) => res.json(req.sessaoAtual.clientes));

app.post("/api/clientes", async (req, res) => {
  const { nome, empresa, email, fone } = req.body;
  if (!nome || !nome.trim()) return res.status(400).json({ erro: "O campo 'nome' é obrigatório." });
  const cliente = { id: uid(), nome: nome.trim(), empresa: empresa || "", email: email || "", fone: fone || "" };
  req.sessaoAtual.clientes.push(cliente);
  await salvar(req);
  res.status(201).json(cliente);
});

app.put("/api/clientes/:id", async (req, res) => {
  const idx = req.sessaoAtual.clientes.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ erro: "Cliente não encontrado." });
  req.sessaoAtual.clientes[idx] = { ...req.sessaoAtual.clientes[idx], ...req.body, id: req.params.id };
  await salvar(req);
  res.json(req.sessaoAtual.clientes[idx]);
});

app.delete("/api/clientes/:id", async (req, res) => {
  req.sessaoAtual.clientes = req.sessaoAtual.clientes.filter(c => c.id !== req.params.id);
  await salvar(req);
  res.status(204).end();
});

// ---------- negócios ----------
app.get("/api/negocios", (req, res) => res.json(req.sessaoAtual.negocios));

app.post("/api/negocios", async (req, res) => {
  const { titulo, cliente, valor, status } = req.body;
  if (!titulo || !titulo.trim()) return res.status(400).json({ erro: "O campo 'titulo' é obrigatório." });
  const negocio = { id: uid(), titulo: titulo.trim(), cliente: cliente || "", valor: Number(valor) || 0, status: status || "Lead" };
  req.sessaoAtual.negocios.push(negocio);
  await salvar(req);
  res.status(201).json(negocio);
});

app.put("/api/negocios/:id", async (req, res) => {
  const idx = req.sessaoAtual.negocios.findIndex(n => n.id === req.params.id);
  if (idx === -1) return res.status(404).json({ erro: "Negócio não encontrado." });
  req.sessaoAtual.negocios[idx] = { ...req.sessaoAtual.negocios[idx], ...req.body, id: req.params.id };
  await salvar(req);
  res.json(req.sessaoAtual.negocios[idx]);
});

app.delete("/api/negocios/:id", async (req, res) => {
  req.sessaoAtual.negocios = req.sessaoAtual.negocios.filter(n => n.id !== req.params.id);
  await salvar(req);
  res.status(204).end();
});

module.exports = app;
