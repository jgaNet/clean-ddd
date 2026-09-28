import { FastifyRequest } from 'fastify';

import { formatOf, present } from '@SharedKernel/Presentation/Format';
import { HomeViewModel } from '@SharedKernel/Presentation/Presenters/Home/ViewModels';
import { HomeJsonPresenter, HomeHtmxPresenter } from '@SharedKernel/Presentation/Presenters/Home';

const presenters = { home: { json: new HomeJsonPresenter(), htmx: new HomeHtmxPresenter() } };

export class HomeController {
  #settings: { version: string; name: string };

  constructor({ settings }: { settings: { version: string; name: string } }) {
    this.#settings = settings;
  }

  async getApiHome(req: FastifyRequest) {
    const viewModel: HomeViewModel = { version: this.#settings.version, name: this.#settings.name };
    return present(presenters.home, formatOf(req), viewModel);
  }
}
