// Payloads sinteticos para caracterizar normalizacao sem acessar APIs externas.
const stableFutureCollection = "2099-07-15T12:34:56Z";
const stableStaleCollection = "2000-07-15T12:34:56Z";

const completeClockPayload = {
  data: {
    clocks: [
      {
        Codigo: "101",
        Nome: "RELOGIO COMPLETO",
        NumeroFabricacao: "SYNTH-FAB-0101",
        Ip: "192.0.2.101",
        UltimaColeta: stableFutureCollection,
        Comunicando: true,
        RelogioDesativado: false,
        MetadadoInterno: "synthetic-private-marker",
      },
    ],
  },
};

const missingValuesPayload = {
  Relogios: [{}],
};

const dateInferencePayload = {
  resultado: [
    {
      Codigo: "201",
      Nome: "COLETA FUTURA",
      UltimaColeta: stableFutureCollection,
    },
    {
      Codigo: "202",
      Nome: "COLETA ANTIGA",
      UltimaColeta: stableStaleCollection,
    },
  ],
};

const deepFabricationPayload = {
  envelope: {
    result: [
      {
        Codigo: "301",
        Nome: "FABRICACAO PROFUNDA",
        detalhes: {
          hardware: {
            identificacaoSerieInterna: "SYNTH-DEEP-0301",
          },
        },
      },
    ],
  },
};

// A correspondencia parcial atual pode tratar o campo Ip como fabricacao.
const ipOnlyFabricationFallbackPayload = {
  clocks: [
    {
      Codigo: "302",
      Nome: "IP SEM FABRICACAO",
      Ip: "198.51.100.32",
    },
  ],
};

const wrapperPayloads = [
  [
    {
      Codigo: "401",
      Nome: "LISTA RAIZ",
    },
  ],
  {
    Relogios: [
      {
        Codigo: "402",
        Nome: "WRAPPER DIRETO",
      },
    ],
  },
  {
    envelope: {
      resposta: {
        items: [
          {
            Codigo: "403",
            Nome: "WRAPPER RECURSIVO",
          },
        ],
      },
    },
  },
];

const mixedArrayPayload = {
  items: [
    null,
    "registro-invalido",
    {
      Codigo: "501",
      Nome: "REGISTRO VALIDO",
    },
    [],
  ],
};

// O wrapper vazio e encontrado antes da lista valida no comportamento atual.
const ambiguousListPayload = {
  data: [],
  result: [
    {
      Codigo: "502",
      Nome: "LISTA IGNORADA",
    },
  ],
};

const fabricationDedupPayload = {
  clocks: [
    {
      Codigo: "601",
      Nome: "FABRICACAO ANTIGA",
      NumeroFabricacao: "SYNTH-DUP-FAB",
      Comunicando: false,
    },
    {
      Codigo: "602",
      Nome: "FABRICACAO PREFERIDA",
      NumeroFabricacao: "SYNTH-DUP-FAB",
      Ip: "203.0.113.62",
      UltimaColeta: stableFutureCollection,
      Comunicando: true,
    },
  ],
};

const codeIpDedupPayload = {
  clocks: [
    {
      Codigo: "701-LEGACY",
      Nome: "CODIGO IP ANTIGO",
      NumeroFabricacao: "-",
      Ip: "203.0.113.71",
      Comunicando: false,
    },
    {
      Codigo: "701",
      Nome: "CODIGO IP PREFERIDO",
      NumeroFabricacao: "-",
      Ip: "203.0.113.71",
      Comunicando: true,
    },
  ],
};

const codeNameDedupPayload = {
  clocks: [
    {
      Codigo: "801-LEGACY",
      Nome: "MESMO NOME",
    },
    {
      Codigo: "801",
      Nome: "MESMO NOME",
      UltimaColeta: stableStaleCollection,
    },
  ],
};

const preferencePayload = {
  clocks: [
    {
      Codigo: "901",
      Nome: "SEM COLETA",
      NumeroFabricacao: "SYNTH-PREF-COLLECTION",
    },
    {
      Codigo: "902",
      Nome: "COM COLETA",
      NumeroFabricacao: "SYNTH-PREF-COLLECTION",
      UltimaColeta: stableStaleCollection,
    },
    {
      Codigo: "903",
      Nome: "SEM IP",
      NumeroFabricacao: "SYNTH-PREF-IP",
    },
    {
      Codigo: "904",
      Nome: "COM IP",
      NumeroFabricacao: "SYNTH-PREF-IP",
      Ip: "198.51.100.94",
    },
    {
      Codigo: "905",
      NumeroFabricacao: "SYNTH-PREF-NAME",
    },
    {
      Codigo: "906",
      Nome: "NOME PREFERIDO",
      NumeroFabricacao: "SYNTH-PREF-NAME",
    },
  ],
};

const orderAndCountersPayload = {
  clocks: [
    {
      Codigo: "1001",
      Nome: "PRIMEIRO ANTIGO",
      NumeroFabricacao: "SYNTH-ORDER-1",
      Comunicando: false,
    },
    {
      Codigo: "1002",
      Nome: "SEGUNDO UNICO",
      NumeroFabricacao: "SYNTH-ORDER-2",
      UltimaColeta: stableFutureCollection,
    },
    {
      Codigo: "1003",
      Nome: "PRIMEIRO PREFERIDO",
      NumeroFabricacao: "SYNTH-ORDER-1",
      UltimaColeta: stableFutureCollection,
    },
    {
      Codigo: "1004",
      Nome: "DESATIVADO",
      NumeroFabricacao: "SYNTH-ORDER-3",
      RelogioDesativado: true,
      Comunicando: true,
    },
  ],
};

module.exports = {
  ambiguousListPayload,
  codeIpDedupPayload,
  codeNameDedupPayload,
  completeClockPayload,
  dateInferencePayload,
  deepFabricationPayload,
  fabricationDedupPayload,
  ipOnlyFabricationFallbackPayload,
  missingValuesPayload,
  mixedArrayPayload,
  orderAndCountersPayload,
  preferencePayload,
  stableFutureCollection,
  wrapperPayloads,
};
