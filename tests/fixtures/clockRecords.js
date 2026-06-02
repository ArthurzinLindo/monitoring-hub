// Fixtures sinteticas: nao representam payload real de cliente ou API externa.
const dimepClockRecord = {
  Codigo: "003",
  Nome: "PATIO DREP",
  NumeroFabricacao: "FAB-0003",
  UltimaColeta: "2026-05-25T10:15:00",
  Comunicando: "false",
};

const madisClockRecord = {
  Relogio: {
    CodigoRelogio: { value: "7" },
    Descricao: { texto: "MADIS OUTLET" },
  },
  Dados: {
    NumeroDeFabricacaoDoEquipamento: "MADIS-0007",
    DataHoraUltimaColeta: { value: "2026-05-26T08:45:00" },
    StatusComunicacao: "online",
  },
};

module.exports = {
  dimepClockRecord,
  madisClockRecord,
};
