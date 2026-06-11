// Payloads sinteticos para caracterizar formatos aceitos sem dados de clientes.
const dimepSuccessPayload = {
  Relogios: [
    {
      Codigo: "101",
      Nome: "DIMEP SINTETICO",
      NumeroFabricacao: "DIMEP-SYNTH-0101",
      Ip: "192.0.2.101",
      UltimaColeta: "2099-01-01T10:00:00",
      Comunicando: true,
      RelogioDesativado: false,
    },
  ],
};

const madisSuccessPayload = {
  data: {
    clocks: [
      {
        Relogio: {
          CodigoRelogio: { value: "202" },
          Descricao: { texto: "MADIS SINTETICO" },
        },
        Dados: {
          NumeroDeFabricacaoDoEquipamento: "MADIS-SYNTH-0202",
          EnderecoIp: "198.51.100.202",
          DataHoraUltimaColeta: { value: "2099-01-01T11:00:00" },
          StatusComunicacao: "online",
        },
      },
    ],
  },
};

const emptyPayload = {
  data: {
    clocks: [],
  },
};

const partiallyInvalidPayload = {
  resultado: [
    null,
    "registro-invalido",
    {
      Codigo: "303",
      Nome: "RELOGIO PARCIAL",
      UltimaColeta: "data-invalida",
    },
    {
      Codigo: "304",
      Nome: "RELOGIO DESATIVADO",
      RelogioDesativado: true,
      Comunicando: true,
    },
  ],
};

module.exports = {
  dimepSuccessPayload,
  emptyPayload,
  madisSuccessPayload,
  partiallyInvalidPayload,
};
