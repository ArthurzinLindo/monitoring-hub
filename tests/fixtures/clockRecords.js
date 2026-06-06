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

const dimepNestedClockRecord = {
  Equipamento: {
    CodigoRelogio: { valor: "015" },
    NomeRelogio: { texto: "DIMEP RECEPCAO" },
    EnderecoIp: "192.0.2.15",
  },
  Status: {
    DataHoraUltimaColeta: { value: "2026-05-27T09:30:00" },
    EmComunicacao: "sim",
  },
};

const madisOfflineClockRecord = {
  Codigo: "21",
  Descricao: "MADIS GARAGEM",
  NumeroSerial: "MADIS-0021",
  Ip: null,
  UltimaComunicacao: "2026-05-20T07:00:00",
  Online: "offline",
};

module.exports = {
  dimepClockRecord,
  dimepNestedClockRecord,
  madisClockRecord,
  madisOfflineClockRecord,
};
