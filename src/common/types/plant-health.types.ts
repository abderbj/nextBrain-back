export interface PlantDiseaseResponse {
  status: string;
  data: {
    diagnostic: {
      class: string;
      confidence: number;
    };
    disease_info: {
      description: string;
      treatment: string[];
      prevention: string[];
    };
    source: string;
  };
}
