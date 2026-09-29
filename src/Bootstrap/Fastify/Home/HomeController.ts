import { FastifyRequest } from 'fastify';

import { formatOf, present } from '@Architecture/Presentation/Format';
import { HomeViewModel } from '@Bootstrap/Fastify/Home/Presenters/ViewModels';
import { HomeJsonPresenter } from '@Bootstrap/Fastify/Home/Presenters/HomeJsonPresenter';
import { HomeHtmxPresenter } from '@Bootstrap/Fastify/Home/Presenters/HomeHtmxPresenter';

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
