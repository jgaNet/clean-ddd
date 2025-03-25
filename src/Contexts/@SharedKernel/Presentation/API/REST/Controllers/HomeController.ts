import { FastifyRequest } from 'fastify';
import { HomeViewModel } from '@Contexts/@SharedKernel/Presentation/Presenters/Home/ViewModels';
import { HomeJsonPresenter, HomeHtmxPresenter } from '@SharedKernel/Presentation/Presenters/Home';
import { PresenterFactory } from '@SharedKernel/Domain/Services';

export class HomeController {
  #settings: { version: string; name: string };
  #presenterFactory: PresenterFactory;

  constructor({ settings }: { settings: { version: string; name: string } }) {
    this.#settings = settings;
    this.#presenterFactory = new PresenterFactory();
    this.#presenterFactory.register({
      name: 'getApiHome',
      presenters: [
        { format: 'json', presenter: new HomeJsonPresenter() },
        { format: 'htmx', presenter: new HomeHtmxPresenter() },
      ],
    });
  }

  async getApiHome(req: FastifyRequest) {
    const viewModel: HomeViewModel = {
      version: this.#settings.version,
      name: this.#settings.name,
    };

    const format = req.headers['hx-request'] ? 'htmx' : 'json';
    const presenter = this.#presenterFactory.get({ name: 'getApiHome', format });

    if (!presenter) {
      throw new Error(`No presenter found for ${format} format`);
    }

    return presenter.present(viewModel);
  }
}
