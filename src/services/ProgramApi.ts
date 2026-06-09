import ApiClient from './ApiClient';
import Endpoints from '../constants/Endpoints';
import {ProgramFinderRequest, ProgramFinderResponse} from '../models/ProgramModel';

const ProgramApi = {
  findPrograms: async (
    request: ProgramFinderRequest,
  ): Promise<ProgramFinderResponse> => {
    const response = await ApiClient.post<ProgramFinderResponse>(
      Endpoints.PROGRAM_FINDER,
      request,
    );
    return response.data;
  },
};

export default ProgramApi;