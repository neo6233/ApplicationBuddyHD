import ApiClient from './ApiClient';
import Endpoints from '../constants/Endpoints';
import {EligibilityRequest, EligibilityResponse} from '../models/EligibilityModel';

const EligibilityApi = {
  checkEligibility: async (
    request: EligibilityRequest,
  ): Promise<EligibilityResponse> => {
    const response = await ApiClient.post<EligibilityResponse>(
      Endpoints.ELIGIBILITY_CHECK,
      request,
    );
    return response.data;
  },
};

export default EligibilityApi;